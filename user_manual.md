# Voltfly Admin Dashboard — User Manual

> **Who is this for?** This guide is written for anyone who manages the Voltfly EV fleet operations — whether you are a Hub Manager overseeing one location or a Super Admin running the entire network. No technical background is required.

---

## Table of Contents

1. [Getting Started — Logging In](#1-getting-started--logging-in)
2. [Understanding the Screen Layout](#2-understanding-the-screen-layout)
3. [Dashboard — Your Network at a Glance](#3-dashboard--your-network-at-a-glance)
4. [Riders — Managing Your Riders](#4-riders--managing-your-riders)
5. [KYC Approvals — Verifying New Riders](#5-kyc-approvals--verifying-new-riders)
6. [Vehicles — Managing the Fleet](#6-vehicles--managing-the-fleet)
7. [Payments — Tracking Money](#7-payments--tracking-money)
8. [Security Deposits](#8-security-deposits)
9. [Service Requests — Handling Maintenance](#9-service-requests--handling-maintenance)
10. [Notifications — Sending Messages to Riders](#10-notifications--sending-messages-to-riders)
11. [Reports — Business Analytics](#11-reports--business-analytics)
12. [Admin Users — Managing Your Team](#12-admin-users--managing-your-team)
13. [Logging Out](#13-logging-out)
14. [Role Permissions Quick Reference](#14-role-permissions-quick-reference)
15. [Common Tasks — Step by Step](#15-common-tasks--step-by-step)

---

## 1. Getting Started — Logging In

### How to open the dashboard

1. Open any web browser (Chrome, Safari, Edge, Firefox).
2. Go to the Voltfly Admin URL shared with you by your administrator.
3. You will land on the **Login page**.

### Logging in

1. Enter your **Email address** in the first field.
2. Enter your **Password** in the second field.
3. Click the **Login** button.
4. If your credentials are correct, the dashboard will open automatically.

> **Tip:** If you see an error saying your account is inactive or not found, contact your Super Admin — your account may not have been created yet.

---

## 2. Understanding the Screen Layout

Once logged in, the screen has two main areas:

### The Sidebar (left side)

This is your main navigation menu. It lists all the sections of the dashboard. Click any item to go to that section.

- On a **desktop or laptop**, the sidebar is always visible on the left.
- On a **mobile phone or tablet**, tap the **hamburger icon** (three horizontal lines ☰) at the top-left to open the sidebar.

### The Top Bar (top of the page)

This strip runs across the top and shows:

- **Your hub name** (if you are a Hub Manager)
- **Your role** (Hub Manager or Super Admin)
- **Your name** (or your initial inside a circle)
- **Logout button** — always in the top-right corner

---

## 3. Dashboard — Your Network at a Glance

**Where:** Click **Dashboard** in the sidebar.

The Dashboard is the first page you see after login. It gives you a **quick health check** of your operations without clicking anything.

### What the cards show

| Card | What it means |
|------|--------------|
| **Active Riders** | Total number of riders currently active on your network |
| **Pending KYC** | Riders who have submitted documents but are waiting for your approval |
| **Overdue Payments** | Riders whose subscription has expired and who still owe money |
| **Swap Access Blocked** | Riders who cannot swap their battery because they have been blocked |
| **Open Service Requests** | Vehicles that have reported an issue and are waiting to be attended to |
| **Available Vehicles** | Vehicles that are not assigned to any rider right now |

### Hub-wise Performance (Super Admin only)

If you are a Super Admin, you will also see a **Hub-wise Performance** section below the main cards. This shows the same six metrics broken down **per hub**, so you can compare how Okhla and Jhandewalan are performing at a glance.

> **Note:** The dashboard automatically refreshes every 60 seconds, so the numbers stay up to date without you needing to reload the page.

---

## 4. Riders — Managing Your Riders

**Where:** Click **Riders** in the sidebar.

This section lists every rider registered on the platform. You can view, search, filter, and export rider information from here.

### The Riders List

Each row in the table shows:
- Rider's **Name** and **Phone number**
- Which **Hub** they belong to
- Their **Status** (e.g., Active, Suspended, Exited)
- Their assigned **Vehicle ID**
- Their **Driver ID** (Upgrid integration ID)
- The date they **Joined**

### Searching and Filtering

- **Search box** — Type a rider's name or phone number to find them instantly.
- **Hub filter** *(Super Admin only)* — Choose between All, Okhla, or Jhandewalan to see only riders from a specific hub.
- **Status filter** — Filter by rider status (Active, Suspended, Exited, etc.).

### Exporting Riders

Click the **Export CSV** button to download the currently filtered list as a spreadsheet (CSV file) that you can open in Excel or Google Sheets.

---

### Viewing a Rider's Full Profile

Click on any rider's row (or the **View** button) to open their full detail page. This page has four tabs:

---

#### Tab 1: Profile & KYC

Shows all of the rider's personal information and their submitted KYC documents:

- Personal details (name, phone, address)
- Identity documents (Aadhaar, licence, etc.)
- Reference contacts
- Document images — click any thumbnail to view it in full size

---

#### Tab 2: Vehicle & Swap Access

Shows the vehicle assigned to this rider and lets you perform key operations:

**Assign a Vehicle**
1. Click **Assign Vehicle**.
2. A list of vehicles available at this rider's hub will appear.
3. Select the vehicle.
4. Fill in the **Handover Checklist** (condition of the vehicle at handover).
5. Confirm to complete the assignment.

**Unassign a Vehicle**
- Click **Unassign** to remove the vehicle from this rider (for example, if the rider is exiting or the vehicle needs servicing).

**Save Upgrid Driver ID**
- Enter the rider's Upgrid Driver ID and click **Save** to link them with the battery swap system.

**Block Swap Access**
- If a rider is overdue on payments or has violated a policy, click **Block Swap**.
- A confirmation dialog will appear — confirm to block the rider's ability to swap batteries. This also suspends their account in the Upgrid system.
- The rider must have a linked Driver ID before you can block them.

**Unblock Swap Access**
- If a suspended rider has paid up or the issue has been resolved, click **Unblock Swap** to restore their access.

**Process Exit**
- When a rider is leaving Voltfly, click **Process Exit**.
- If they have a vehicle assigned, you will be prompted to complete a **Return Handover Checklist** first.
- This officially marks the rider as exited.

---

#### Tab 3: Payments

Shows all payments made by this rider:

- **This Month Total** — a summary amount paid in the current month.
- Full payment history table (date, plan, amount, method, status).

**Log a Cash Payment**
- If a rider has paid in cash, click **Log Cash Payment**.
- Enter the amount and any notes, then confirm.
- This records the cash payment in the system so the rider's account is updated.

---

#### Tab 4: Service Requests

Shows all maintenance or service requests raised by or for this rider's vehicle. This tab is **read-only** — to update a service request, go to the **Service Requests** section from the sidebar.

---

## 5. KYC Approvals — Verifying New Riders

**Where:** Click **KYC Approvals** in the sidebar.

When a new rider signs up and submits their documents for verification, their application appears here for you to review.

> **Live badge:** The sidebar shows a red badge with the number of pending KYC submissions so you always know how many are waiting.

### Reviewing a KYC Application

1. Click on any row to open a **side panel** on the right showing the full KYC details.
2. Review the rider's:
   - Personal information
   - Identity documents (Aadhaar, driving licence, etc.)
   - Address proof
   - Reference contacts
   - Document photographs

### Approving

- Click the **Approve** button if all documents are correct and complete.
- The rider's KYC status changes to "Approved" and they can proceed to use the service.

### Rejecting

- Click **Reject** if documents are incomplete, unclear, or fraudulent.
- You **must enter a reason** before confirming rejection.
- The rider will be notified with the rejection reason so they can resubmit.

> **Note:** This page updates in real time. If a new KYC submission arrives while you are on this page, it will appear automatically without refreshing.

---

## 6. Vehicles — Managing the Fleet

**Where:** Click **Vehicles** in the sidebar.

This section gives you an overview of all vehicles in the fleet and lets you add or edit vehicle records.

### Summary Cards

At the top of the page you will see:

- **Total Fleet** — total number of vehicles
- **Assigned** — vehicles currently with a rider
- **Available** — vehicles not assigned to anyone
- **Primary Hub** — the hub with the most vehicles

### The Vehicles Table

Each row shows:
- **Vehicle ID**
- **Chassis number**
- **Hub** it belongs to
- **Status** — Assigned (and which rider) or Available
- **Edit** icon (pencil icon) to modify the vehicle record

### Filtering Vehicles

- **Search** by Vehicle ID or chassis number.
- **Hub filter** *(Super Admin only)* — filter by hub.
- **Status filter** — show only Assigned or Available vehicles.

### Adding a New Vehicle

1. Click **Add Vehicle** button (usually at the top-right of the table).
2. Fill in:
   - **Vehicle ID**
   - **Chassis Number**
   - **Hub** *(Super Admin can choose; Hub Managers default to their hub)*
3. Click **Save** to add the vehicle to the fleet.

### Editing a Vehicle

1. Click the **pencil/edit icon** on any vehicle row.
2. Update the details as needed.
3. Click **Save**.

> **Note:** Assigning or unassigning a vehicle to/from a rider is done from the **Rider's detail page**, not from here.

---

## 7. Payments — Tracking Money

**Where:** Click **Payments** in the sidebar.

This section has three tabs to give you a complete picture of all financial activity.

---

### Tab 1: Payments List

A full history of all payments — from subscriptions to one-time charges.

**Table columns:** Rider name, Date, Plan, Amount, Payment Method (online/cash), Status (paid/pending/failed).

**Filters:**
- **Search** by rider name or phone
- **Hub** *(Super Admin only)*
- **Date range** — set a start and end date
- **Method** — filter by Online or Cash
- **Status** — filter by Paid, Pending, Failed, etc.

**Export CSV** — Downloads the filtered payment list as a spreadsheet.

**Log Cash Payment**
- Click **Log Cash Payment** to manually record a cash payment from a rider.
- Select the rider, enter the amount, plan, and any notes, then confirm.

---

### Tab 2: Overdue

Shows all riders whose subscription payment is overdue.

**What you see:**
- Rider name and hub
- How many **days overdue** they are
- **Amount owed** (calculated at ₹250 per day)
- Battery status (whether their swap access is still active or already blocked)

**Block Battery**
- If a rider has been overdue for too long, click **Block Battery** on their row.
- This will disable their battery swap access until they clear their dues.

---

### Tab 3: Security Deposits

A view of security deposits collected from riders. See the [Security Deposits](#8-security-deposits) section below for full details on processing refunds.

---

## 8. Security Deposits

**Where:** Click **Security Deposits** in the sidebar (or use the Security Deposits tab in Payments).

This dedicated page manages all security deposit records.

### Summary Stats

- **Total Collected** — Total security deposits ever received
- **Currently Held** — Deposits still held (rider is active)
- **Refund Pending** — Deposits where a refund has been requested but not yet processed
- **Refunded** — Total deposits already returned to riders

### Filtering

- **Search** by rider name or phone
- **Status filter** — filter by Held, Refund Pending, Refunded, etc.

### Processing a Refund

When a rider exits and is entitled to their deposit back:

1. Find the rider in the table.
2. Click **Process Refund**.
3. A dialog will open. Fill in:
   - Any **deductions** (e.g., damage, outstanding dues) — enter the amount and reason.
   - A **reason** for the refund.
4. Click **Confirm** to process the refund.

> The refund is recorded in the system and the rider's deposit status is updated automatically.

---

## 9. Service Requests — Handling Maintenance

**Where:** Click **Service Requests** in the sidebar.

This section tracks all maintenance, repair, or breakdown requests for vehicles.

### Summary Stats

- **Total** — All service requests ever raised
- **Open** — New requests not yet attended to
- **In Progress** — Requests being worked on
- **Resolved** — Completed requests

### The Service Requests Table

Shows each request with the vehicle, rider, type of issue, current status, and when it was raised.

> **Live updates:** New service requests appear automatically in real time.

### Updating a Service Request

1. Click on a service request row to open an **Update panel** on the right side.
2. Fill in or update:
   - **Status** — change from Open → In Progress → Resolved
   - **Resolution Notes** — describe what was done to fix the issue
   - **Charges** — enter any charges applied for parts or labour
   - **Photo** *(optional)* — attach a photo of the completed work
   - If parts were used, a **Parts Breakdown** section will show prepaid components.
3. Click **Save** to update the request.

---

## 10. Notifications — Sending Messages to Riders

**Where:** Click **Notifications** in the sidebar.

> **Super Admin only** — This section is only visible to Super Admins.

Use this section to send push notifications or SMS messages to riders.

### Composing a Notification

1. Choose your **Target audience**:
   - **All Active Riders** — sends to every active rider on the platform
   - **One Hub** — sends to all riders at a specific hub (Okhla or Jhandewalan)
   - **One Rider** — search for a specific rider by name or phone
2. Enter a **Title** for the notification.
3. Enter your **Message** body.
4. Choose the **Channel(s)**:
   - **Push** — sends a push notification to their phone app
   - **SMS** — sends a text message to their phone number
   - You can select both at the same time.
5. Click **Send**.

### Sent History

Below the compose form, you will see a log of all previously sent notifications — who they were sent to, the message, the channel, and when they were sent.

---

## 11. Reports — Business Analytics

**Where:** Click **Reports** in the sidebar.

> **Super Admin only** — This section is only visible to Super Admins.

The Reports page gives you a deep look at business performance across the whole network.

### What the Reports cover

| Section | What you learn |
|---------|---------------|
| **Revenue Overview** | Total revenue for this week, this month, last month, and all time |
| **Revenue by Type** | Breakdown between rental income and service charges |
| **Deposits** | Total security deposit amounts |
| **Overdue Riders** | Count of riders who owe money |
| **Rider Counts** | Total riders and how they are split by status |
| **KYC Summary** | How many KYC applications are approved, pending, or rejected |
| **Revenue by Plan** | Which subscription plans generate the most money |
| **Payment Methods** | Split between online payments and cash |
| **Hub Breakdown** | All the above metrics compared side by side for each hub |
| **Service Summary** | Open vs resolved service requests and associated costs |

> Reports are pulled fresh each time you visit the page. There is no need to refresh manually.

---

## 12. Admin Users — Managing Your Team

**Where:** Click **Admin Users** in the sidebar.

> **Super Admin only** — This section is only visible to Super Admins.

This section lets you see everyone who has access to the admin dashboard and add new team members.

### The Admin Users Table

Shows every admin account with:
- **Name**
- **Email**
- **Role** — Hub Manager or Super Admin
- **Hub** — (only for Hub Managers) which hub they manage
- **Active** — whether their account is currently enabled
- **Date Joined**

### Adding a New Admin User

1. Click the **Add User** button.
2. Fill in:
   - **Full Name**
   - **Email address**
   - **Password** — they can change this after first login
   - **Role** — choose between:
     - **Hub Manager** — can manage one hub's operations
     - **Super Admin** — full access to the entire platform
   - **Hub** — if you chose Hub Manager, select which hub they will manage
3. Click **Save** to create the account.

> The new user can now log in with the email and password you provided.

---

## 13. Logging Out

Always log out when you are done, especially on shared computers.

1. Look at the **top-right corner** of the screen.
2. Click the **Logout** button.
3. You will be taken back to the Login page.

---

## 14. Role Permissions Quick Reference

| Feature | Hub Manager | Super Admin |
|---------|:-----------:|:-----------:|
| Dashboard (own hub) | ✅ | ✅ |
| Hub-wise Dashboard | ❌ | ✅ |
| Riders (own hub) | ✅ | ✅ |
| Riders (all hubs) | ❌ | ✅ |
| KYC Approvals | ✅ | ✅ |
| Vehicles | ✅ | ✅ |
| Payments | ✅ | ✅ |
| Security Deposits | ✅ | ✅ |
| Service Requests | ✅ | ✅ |
| Notifications | ❌ | ✅ |
| Reports | ❌ | ✅ |
| Admin Users | ❌ | ✅ |
| Broadcast to all hubs | ❌ | ✅ |

---

## 15. Common Tasks — Step by Step

### Approving a new rider's KYC

1. Click **KYC Approvals** in the sidebar.
2. Click the rider's row to open their documents.
3. Review all documents carefully.
4. Click **Approve** if everything looks correct.

---

### Blocking a rider's swap access for non-payment

1. Click **Riders** → find and open the rider's profile.
2. Go to the **Vehicle & Swap Access** tab.
3. Make sure a **Driver ID** is saved (required to block).
4. Click **Block Swap** and confirm in the dialog.

---

### Recording a cash payment from a rider

1. Click **Payments** in the sidebar.
2. Click **Log Cash Payment**.
3. Search for and select the rider.
4. Enter the amount, plan, and date.
5. Click **Save**.

---

### Processing a security deposit refund

1. Click **Security Deposits** in the sidebar.
2. Find the rider in the table.
3. Click **Process Refund**.
4. Enter any deductions and the reason.
5. Click **Confirm**.

---

### Updating a service request to Resolved

1. Click **Service Requests** in the sidebar.
2. Click the service request row.
3. Change **Status** to **Resolved**.
4. Add **Resolution Notes** explaining what was done.
5. Enter any **Charges** if applicable.
6. Click **Save**.

---

### Sending a notification to all riders at a hub

1. Click **Notifications** in the sidebar *(Super Admin only)*.
2. Under Target, select **One Hub** and choose the hub.
3. Enter a **Title** and **Message**.
4. Select your channel (**Push**, **SMS**, or both).
5. Click **Send**.

---

### Processing a rider exit

1. Click **Riders** → open the rider's profile.
2. Click **Process Exit** in the header.
3. If the rider has a vehicle, complete the **Return Handover Checklist**.
4. Confirm to mark the rider as exited.

---

### Adding a new vehicle to the fleet

1. Click **Vehicles** in the sidebar.
2. Click **Add Vehicle**.
3. Enter the **Vehicle ID**, **Chassis Number**, and **Hub**.
4. Click **Save**.

---

*Voltfly Admin v1.0 — For support, contact your system administrator.*
