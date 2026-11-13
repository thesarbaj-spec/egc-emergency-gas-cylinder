/* ==========================================
   EGC CUSTOMER E-SLIP SYSTEM
   File: payments-slip.js
========================================== */

(function () {
  "use strict";

  // HTML special characters protection
  function slipEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function slipMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN");
  }

  function slipDate(value) {
    if (!value) return "N/A";

    const date = new Date(value);

    if (isNaN(date.getTime())) return slipEscape(value);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function slipStatus(value) {
    return String(value || "Pending")
      .replace(/_/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  // Find slip connected with request
  function getSlipForPayment(payment) {
    const slips = window.currentSlips || [];

    if (!payment || !Array.isArray(slips)) {
        console.error("E-Slip data is not available.");
        return null;
    }

    const slip = slips.find(item =>
        String(item.request_id) === String(payment.request_id) &&
        String(item.slip_status).toLowerCase() === "active"
    );

    console.log("Payment Request ID:", payment.request_id);
    console.log("Matched E-Slip:", slip);

    return slip || null;
}
  // Generate E-Slip HTML
  function createESlipHtml(slip, request) {
    if (!slip) {
      return `<html><body><h2>E-Slip not found</h2></body></html>`;
    }

    const userName =
      slip.user_name ||
      request?.customer_name ||
      "EGC Customer";

const userMobile =
  slip.mobile ||
  slip.user_mobile ||
  request?.mobile ||
  request?.mobile_number ||
  "N/A";

const requestNumber =
  request?.request_number ||
  request?.request_id ||
  slip.request_id ||
  "N/A";

    const slipNumber = slip.slip_number || "N/A";

    const historical =
      slip.slip_type === "historical_recovery";

    const qrValue =
      slip.qr_data ||
      slip.verification_code ||
      slip.slip_number ||
      "EGC";

const payments = Array.isArray(window.currentPayments)
? window.currentPayments
.filter(payment =>
String(payment.request_id) === String(slip.request_id)
)
.sort((a, b) => {
const dateA = new Date(a.payment_date || a.created_at || 0).getTime();
const dateB = new Date(b.payment_date || b.created_at || 0).getTime();
return dateA - dateB;
})
: [];

const paymentRows = payments.map(payment => {
  const paymentAmount =
    payment.amount ??
    payment.payment_amount ??
    payment.paid_amount ??
    payment.total_amount ??
    0;

  const paymentType =
    payment.payment_type ||
    payment.type ||
    (
      String(payment.id) === String(slip.payment_id)
        ? "Initial Payment"
        : "Repayment"
    );

  const paymentDate =
    payment.payment_date ||
    payment.paid_at ||
    payment.created_at;

  const paymentStatus =
    payment.payment_status ||
    payment.status ||
    "Pending";

  return `
    <tr>
      <td>${slipEscape(paymentType)}</td>
      <td>${slipEscape(slipDate(paymentDate))}</td>
      <td>${slipMoney(paymentAmount)}</td>
      <td>${slipEscape(slipStatus(paymentStatus))}</td>
    </tr>
  `;
}).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EGC Customer E-Slip</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 25px;
  background: #f1f5f9;
  font-family: Arial, sans-serif;
  color: #172033;
}

.slip {
  max-width: 800px;
  margin: auto;
  padding: 30px;
  background: white;
  border: 1px solid #dce3ed;
  border-radius: 12px;
}

/* HEADER */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #dbeafe;
  padding-bottom: 22px;
  gap: 15px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.logo-img {
  width: 110px;
  height: auto;
  max-height: 65px;
  object-fit: contain;
}

.header-title {
  font-size: 22px;
  font-weight: 800;
  color: #174b7c;
}

.subtitle {
  color: #7890a8;
  font-size: 13px;
  margin-top: 5px;
}

.slip-title {
  text-align: center;
  font-size: 11px;
  font-weight: bold;
  color: #087443;
  background: #e9f9f0;
  padding: 11px 16px;
  border-radius: 25px;
  white-space: nowrap;
}

/* HISTORICAL NOTICE */
.historical {
  background: #fff7ed;
  color: #9a3412;
  padding: 12px;
  margin-top: 18px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

/* SECTIONS */
.section {
  margin-top: 25px;
}

.section h3 {
  font-size: 15px;
  color: #dc2626;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
}

/* INFORMATION GRID */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.field {
  padding: 12px;
  background: #f8fafc;
  border-radius: 7px;
  min-width: 0;
}

.label {
  display: block;
  color: #64748b;
  font-size: 12px;
  margin-bottom: 6px;
}

.value {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* PAYMENT TABLE */
.table-wrap {
  width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 12px;
}

th, td {
  padding: 10px 7px;
  border: 1px solid #e2e8f0;
  text-align: left;
}

th {
  background: #f1f5f9;
}

/* TOTAL */
.total {
  margin-top: 20px;
  padding: 16px;
  background: #eff6ff;
  border-radius: 8px;
  line-height: 1.6;
  font-size: 15px;
}

.total strong {
  color: #1d4ed8;
}

/* VERIFICATION */
.verification {
  margin-top: 20px;
  padding: 18px 15px;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
}

.code {
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 2px;
  margin-top: 8px;
  overflow-wrap: anywhere;
}

/* FOOTER */
.footer {
  margin-top: 25px;
  padding-top: 15px;
  border-top: 1px solid #e2e8f0;
  text-align: center;
  font-size: 11px;
  color: #64748b;
  line-height: 1.6;
}

/* PRINT BUTTON */
.print-btn {
  display: block;
  margin: 20px auto;
  padding: 12px 25px;
  border: 0;
  border-radius: 7px;
  background: #0875c9;
  color: white;
  font-weight: bold;
  cursor: pointer;
}

/* MOBILE */
@media(max-width:600px) {
  body {
    padding: 10px;
  }

  .slip {
    padding: 16px;
    border-radius: 9px;
  }

  .header {
    align-items: center;
    gap: 8px;
    padding-bottom: 16px;
  }

  .header-left {
    gap: 8px;
    min-width: 0;
  }

  .logo-img {
    width: 68px;
    max-height: 48px;
  }

  .header-title {
    font-size: 16px;
  }

  .subtitle {
    font-size: 10px;
  }

  .slip-title {
    font-size: 9px;
    padding: 8px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .field {
    padding: 10px;
  }

  .section {
    margin-top: 20px;
  }

  table {
    font-size: 10px;
    min-width: 450px;
  }

  th, td {
    padding: 8px 5px;
  }

  .total {
    font-size: 13px;
    padding: 13px;
  }

  .code {
    font-size: 17px;
  }
}

/* PRINT */
@media print {
  body {
    padding: 0;
    background: white;
  }

  .slip {
    border: 0;
    border-radius: 0;
    max-width: 100%;
    padding: 20px;
  }

  .print-btn {
    display: none;
  }

  .historical,
  .field,
  .total,
  .verification {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
</head>

<body>

<div class="slip">

  <!-- EGC HEADER -->
  <div class="header">

    <div class="header-left">

      <img
        src="assets/EGC - Emergency Gas Cylinder logo.png"
        class="logo-img"
        alt="EGC Logo"
      >

      <div>
        <div class="header-title">Payment Slip</div>
        <div class="subtitle">Emergency Gas Cylinder</div>
      </div>

    </div>

    <div class="slip-title">
      PAYMENT VERIFIED
    </div>

  </div>

  <!-- HISTORICAL NOTICE -->
  ${historical ? `
    <div class="historical">
      <strong>Historical E-Slip Copy</strong><br>
      This slip has been generated from preserved historical records.
      It is not a new payment approval or agency release.
    </div>
  ` : ""}

  <!-- SLIP INFORMATION -->
  <div class="section">
    <h3>Slip Information</h3>

    <div class="grid">

      <div class="field">
        <span class="label">Slip Number</span>
        <span class="value">${slipEscape(slipNumber)}</span>
      </div>

      <div class="field">
        <span class="label">Request Number</span>
        <span class="value">${slipEscape(requestNumber)}</span>
      </div>

      <div class="field">
        <span class="label">Slip Date</span>
        <span class="value">${slipDate(slip.created_at)}</span>
      </div>

      <div class="field">
        <span class="label">Payment Status</span>
        <span class="value">${slipEscape(slipStatus(slip.payment_status))}</span>
      </div>

    </div>
  </div>

  <!-- CUSTOMER DETAILS -->
  <div class="section">
    <h3>Customer Details</h3>

    <div class="grid">

      <div class="field">
        <span class="label">Customer Name</span>
        <span class="value">${slipEscape(userName)}</span>
      </div>

      <div class="field">
        <span class="label">Mobile Number</span>
        <span class="value">${slipEscape(userMobile)}</span>
      </div>

      <div class="field">
        <span class="label">EGC User ID</span>
        <span class="value">${slipEscape(slip.user_code || "N/A")}</span>
      </div>

      <div class="field">
        <span class="label">Customer Address</span>
        <span class="value">${slipEscape(request?.address || "N/A")}</span>
      </div>

    </div>
  </div>

  <!-- LPG AND AGENCY DETAILS -->
  <div class="section">
    <h3>LPG & Agency Details</h3>

    <div class="grid">

      <div class="field">
        <span class="label">LPG Company</span>
        <span class="value">${slipEscape(slip.lpg_company || "N/A")}</span>
      </div>

      <div class="field">
        <span class="label">Agency Name</span>
        <span class="value">${slipEscape(slip.agency_name || "N/A")}</span>
      </div>

      <div class="field">
        <span class="label">Cylinder Quantity</span>
        <span class="value">${slipEscape(slip.quantity || 1)}</span>
      </div>

      <div class="field">
        <span class="label">Delivery Status</span>
        <span class="value">${slipEscape(slipStatus(slip.delivery_status))}</span>
      </div>

      <div class="field">
        <span class="label">Delivery Date</span>
        <span class="value">${slipDate(request?.delivery_date)}</span>
      </div>

    </div>
  </div>

  <!-- PAYMENT DETAILS -->
  <div class="section">
    <h3>Payment & Repayment Details</h3>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Payment Type</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${paymentRows || `
            <tr>
              <td colspan="4">No payment history available</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>

    <div class="total">

      <div>
        Cylinder Amount:
        <strong>${slipMoney(slip.cylinder_amount)}</strong>
      </div>

      <div>
        Extra Charge:
        <strong>${slipMoney(slip.extra_charge)}</strong>
      </div>

      <div>
        Payment Amount:
        <strong>${slipMoney(slip.payment_amount)}</strong>
      </div>

      <div>
        Total Amount:
        <strong>${slipMoney(slip.total_amount)}</strong>
      </div>

    </div>
  </div>

  <!-- VERIFICATION -->
  <div class="verification">

    <div>Slip Verification Code</div>

    <div class="code">
      ${slipEscape(slip.verification_code || "N/A")}
    </div>

    <small>Keep this code for your records.</small>

  </div>

  <!-- FOOTER -->
  <div class="footer">

    <strong>EGC - Emergency Gas Cylinder</strong>

    <br>

    This is a system-generated E-Slip.
    Please keep it safe for future reference.

  </div>

</div>

<button class="print-btn" onclick="window.print()">
  Print / Save PDF
</button>

</body>
</html>`;
  }

  // Open E-Slip
  async function openPaymentSlip(paymentId) {
    try {
      const payment = window.currentPayments?.find(
        item => String(item.id) === String(paymentId)
      );

      if (!payment) {
        alert("Payment record not found.");
        return;
      }

      const slip = getSlipForPayment(payment);

      if (!slip) {
        alert("E-Slip is not available for this request yet.");
        return;
      }

      const request = window.currentRequests?.find(
        item => String(item.id) === String(payment.request_id)
      );

      const slipWindow = window.open("", "_blank");

      if (!slipWindow) {
        alert("Please allow pop-ups to view your E-Slip.");
        return;
      }

      slipWindow.document.open();
      slipWindow.document.write(createESlipHtml(slip, request));
      slipWindow.document.close();

    } catch (error) {
      console.error("Open E-Slip Error:", error);
      alert("Unable to open E-Slip.");
    }
  }

  // Download E-Slip as HTML file
  async function downloadPaymentSlip(paymentId) {
    try {
      const payment = window.currentPayments?.find(
        item => String(item.id) === String(paymentId)
      );

      if (!payment) {
        alert("Payment record not found.");
        return;
      }

      const slip = getSlipForPayment(payment);

      if (!slip) {
        alert("E-Slip is not available for this request yet.");
        return;
      }

      const request = window.currentRequests?.find(
        item => String(item.id) === String(payment.request_id)
      );

      const html = createESlipHtml(slip, request);

      const blob = new Blob([html], {
        type: "text/html;charset=utf-8"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `EGC-${slip.slip_number || "ESlip"}.html`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (error) {
      console.error("Download E-Slip Error:", error);
      alert("Unable to download E-Slip.");
    }
  }

  // Make functions available to payments.html
  window.createESlipHtml = createESlipHtml;
  window.getSlipForPayment = getSlipForPayment;
  window.openPaymentSlip = openPaymentSlip;
  window.downloadPaymentSlip = downloadPaymentSlip;

  // Connect payments.html variables
function getEGCPaymentData() {
  return {
    payments: typeof currentPayments !== "undefined" ? currentPayments : [],
    requests: typeof currentRequests !== "undefined" ? currentRequests : [],
    slips: typeof currentSlips !== "undefined" ? currentSlips : []
  };
}

})();