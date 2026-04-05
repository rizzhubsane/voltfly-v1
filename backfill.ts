import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase env info");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function backfill() {
  console.log("Starting backfill for service_request payments...");

  const { data: serviceRequests, error: srError } = await supabaseAdmin
    .from('service_requests')
    .select('*')
    .eq('payment_status', 'paid');
    
  if (srError) throw srError;

  console.log(`Found ${serviceRequests?.length || 0} paid service requests.`);

  const { data: payments, error: pError } = await supabaseAdmin
    .from('payments')
    .select('razorpay_payment_id')
    .eq('plan_type', 'spare_parts');
    
  if (pError) throw pError;

  const existingPaymentIds = new Set((payments || []).map(p => p.razorpay_payment_id).filter(Boolean));

  let insertedCount = 0;

  for (const sr of (serviceRequests || [])) {
    if (sr.razorpay_payment_id && !existingPaymentIds.has(sr.razorpay_payment_id)) {
      const { error } = await supabaseAdmin.from('payments').insert({
        rider_id: sr.rider_id,
        amount: sr.total_parts_cost || 0,
        plan_type: 'spare_parts',
        method: 'razorpay_online',
        status: 'paid',
        razorpay_payment_id: sr.razorpay_payment_id,
        paid_at: sr.created_at, // use service request creation date
        notes: `Backfilled from Service Request: ${sr.issue_description || 'Spares'}`
      });
      
      if (error) {
        console.error("Failed inserting payment for SR", sr.id, error);
      } else {
        console.log("Inserted payment for SR", sr.id);
        insertedCount++;
      }
    }
  }

  console.log(`Backfill completed. Inserted ${insertedCount} payments.`);
}

backfill().catch(console.error);
