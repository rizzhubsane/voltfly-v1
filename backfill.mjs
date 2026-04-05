import fs from 'fs';

// Read .env.local properly (keys can contain = signs)
const envFile = fs.readFileSync('.env.local', 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return;
  const k = line.substring(0, eqIdx).trim();
  const v = line.substring(eqIdx + 1).trim();
  if (k === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = v;
  if (k === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = v;
});

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

console.log("URL:", supabaseUrl);
console.log("Key length:", supabaseKey.length);

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function backfill() {
  console.log("Step 1: Fetching paid service requests...");
  
  const srRes = await fetch(
    `${supabaseUrl}/rest/v1/service_requests?payment_status=eq.paid&select=*`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  
  if (!srRes.ok) {
    console.error("Failed to fetch service requests:", srRes.status, await srRes.text());
    process.exit(1);
  }
  
  const serviceRequests = await srRes.json();
  console.log(`Found ${serviceRequests.length} paid service requests.`);

  if (serviceRequests.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  let count = 0;
  for (const sr of serviceRequests) {
    console.log(`Processing SR ${sr.id}...`);
    const payload = {
      rider_id: sr.rider_id,
      amount: sr.total_parts_cost || 0,
      plan_type: 'daily',
      method: 'upi',
      status: 'paid',
      due_date: (sr.created_at || new Date().toISOString()).split('T')[0],
      razorpay_payment_id: sr.razorpay_payment_id || null,
      paid_at: sr.created_at,
      notes: `Spare Parts: ${sr.issue_description || 'Service Request'}`
    };

    const insRes = await fetch(`${supabaseUrl}/rest/v1/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    if (!insRes.ok) {
      console.error("FAILED for SR", sr.id, ":", await insRes.text());
    } else {
      console.log("OK - inserted payment for SR", sr.id);
      count++;
    }
  }

  console.log(`\nDone. Inserted ${count} of ${serviceRequests.length} payments.`);
  process.exit(0);
}

backfill().catch(err => { console.error("FATAL:", err); process.exit(1); });
