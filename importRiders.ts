import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const jsonPath = '/Users/rishabhsain/.gemini/antigravity/brain/0f3f78cf-eff1-4255-892c-6ef866e5be91/scratch/parsed_riders.json';
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  let addedRiders = 0;
  let skippedRiders = 0;

  for (const row of data) {
    let phone = row[' Mobile'] ? String(row[' Mobile']).replace('.0', '') : '';
    const driverId = row['Driver ID'];
    const name = row['Driver Name'];
    const vehicleRegNo = row['Vehicle Registration No'];
    const onboardingDate = row['Onboarding Date'];
    
    // Ensure 10-digit format for phone if possible
    if (phone.length > 10) {
      phone = phone.slice(-10);
    }
    
    if (!name || !phone) {
        console.log(`Skipping invalid row: ${JSON.stringify(row)}`);
        continue;
    }

    // 1. Check if rider exists by driver_id or phone_1
    const { data: existingRiders, error: findError } = await supabase
      .from('riders')
      .select('id')
      .or(`driver_id.eq.${driverId},phone_1.eq.${phone}`);

    if (findError) {
      console.error(`Error querying rider ${driverId}:`, findError.message);
      continue;
    }

    let riderId;

    if (existingRiders && existingRiders.length > 0) {
      // Rider already exists
      riderId = existingRiders[0].id;
      skippedRiders++;
      console.log(`Rider ${name} (${driverId}) already exists. Skipped creation.`);
    } else {
      // Insert new rider
      const { data: newRider, error: insertError } = await supabase
        .from('riders')
        .insert({
          name: name,
          phone_1: phone,
          driver_id: driverId,
          status: 'active',
          outstanding_balance: 0,
          created_at: onboardingDate ? new Date(onboardingDate).toISOString() : new Date().toISOString()
        })
        .select('id')
        .single();
        
      if (insertError) {
        console.error(`Error inserting rider ${name} (${driverId}):`, insertError.message);
        continue;
      }
      riderId = newRider.id;
      addedRiders++;
      console.log(`Inserted rider ${name} (${driverId}).`);
    }

    // 2. Register/Assign Vehicle if present
    if (vehicleRegNo && vehicleRegNo.startsWith('VFEL')) {
      const { data: vehicleData, error: vehicleErr } = await supabase
        .from('vehicles')
        .select('id')
        .eq('vehicle_id', vehicleRegNo);
      
      if (vehicleErr) {
        console.error(`Error querying vehicle ${vehicleRegNo}:`, vehicleErr.message);
        continue;
      }

      if (vehicleData && vehicleData.length > 0) {
        // Vehicle exists, update assigned_rider_id
        await supabase
          .from('vehicles')
          .update({ assigned_rider_id: riderId, assigned_at: onboardingDate ? new Date(onboardingDate).toISOString() : new Date().toISOString() })
          .eq('id', vehicleData[0].id);
        console.log(`Assigned existing vehicle ${vehicleRegNo} to rider ${driverId}`);
      } else {
        // Create new vehicle and assign
        await supabase
          .from('vehicles')
          .insert({
            vehicle_id: vehicleRegNo,
            chassis_number: 'UNKNOWN',
            assigned_rider_id: riderId,
            assigned_at: onboardingDate ? new Date(onboardingDate).toISOString() : new Date().toISOString()
          });
        console.log(`Created and assigned new vehicle ${vehicleRegNo} to rider ${driverId}`);
      }
    }
  }

  console.log(`Done. Added: ${addedRiders}, Skipped/Existing: ${skippedRiders}`);
}

main().catch(console.error);
