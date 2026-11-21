/* ==========================================
   EGC CUSTOMER E-SLIP SYSTEM
   Corrected Complete Version
   File: payments-slip.js
========================================== */

(function () {
  "use strict";

  /* ==========================================
     BASIC HELPERS
  ========================================== */

  function slipEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function slipMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function slipDate(value) {
    if (!value) return "Pending";

    const date = new Date(value);

    if (isNaN(date.getTime())) return slipEscape(value);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function slipDateTime(value) {
    if (!value) return "N/A";

    const date = new Date(value);

    if (isNaN(date.getTime())) return "N/A";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function slipNormalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function slipStatus(value) {
    if (!value) return "Pending";

    return String(value)
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function slipIsApproved(value) {
    return ["approved", "approve", "accepted"]
      .includes(slipNormalize(value));
  }

  function slipIsRejected(value) {
    return [
      "rejected",
      "reject",
      "failed",
      "cancelled",
      "canceled",
      "declined"
    ].includes(slipNormalize(value));
  }

  /* ==========================================
     PAYMENT HELPERS
  ========================================== */

  function slipGetPaymentApproval(payment) {
    return slipNormalize(
      payment?.verification_status ||
      payment?.owner_approval ||
      payment?.approval_status ||
      payment?.owner_status ||
      ""
    );
  }

  function slipIsOwnerApproved(payment) {
    if (!payment) return false;

    return (
      slipIsApproved(slipGetPaymentApproval(payment)) &&
      !slipIsRejected(payment.payment_status) &&
      !slipIsRejected(payment.status)
    );
  }

  function slipGetPaymentAmount(payment) {
    return Number(
      payment?.payment_amount ??
      payment?.amount ??
      payment?.paid_amount ??
      0
    );
  }

  function slipGetPaymentType(payment) {
    const type = slipNormalize(
      payment?.payment_type ||
      payment?.type ||
      payment?.payment_category ||
      ""
    );

    if ([
      "initial",
      "initial_payment",
      "advance",
      "first_payment"
    ].includes(type)) {
      return "Initial Payment";
    }

    if ([
      "repayment",
      "remaining",
      "remaining_payment",
      "partial",
      "partial_payment",
      "final_payment"
    ].includes(type)) {
      return "Repayment";
    }

    return slipStatus(type || "Payment");
  }

  function slipGetRequestStatus(request) {
    return (
      request?.request_status ||
      request?.status ||
      "Pending"
    );
  }

  /* ==========================================
     PAYMENT NOTES
  ========================================== */

  function slipGetPaymentMetadata(payment) {
    if (!payment?.notes) return {};

    if (typeof payment.notes === "object") {
      return payment.notes;
    }

    try {
      return JSON.parse(payment.notes);
    } catch (error) {
      return {};
    }
  }

  /* ==========================================
     DELIVERY DATE
  ========================================== */

  function slipGetDeliveryDate(request, slip) {
    return (
      request?.delivery_date ||
      request?.delivered_at ||
      request?.actual_delivery_date ||
      request?.cylinder_delivery_date ||
      slip?.delivered_at ||
      slip?.delivery_date ||
      null
    );
  }

  /* ==========================================
     EXTRA CHARGE CALCULATION
     
     Delivery day       = ₹20
     Days 1-10          = ₹50
     Days 11-15         = ₹60
     Days 16-30         = ₹80
     Day 31 onward      = ₹100
  ========================================== */

  function slipCalculateExtraCharge(days) {
    if (days < 0) return 0;

    if (days === 0) return 20;
    if (days <= 10) return 50;
    if (days <= 15) return 60;
    if (days <= 30) return 80;

    return 100;
  }

  function slipGetExtraCharge(payment, slip, request) {

    const metadata = slipGetPaymentMetadata(payment);

    /*
      1. First preference:
      Repayment payment notes.
    */

    const metadataCharge = Number(metadata.extra_charge);

    if (
      metadata.extra_charge !== undefined &&
      metadata.extra_charge !== null &&
      metadata.extra_charge !== "" &&
      Number.isFinite(metadataCharge) &&
      metadataCharge > 0
    ) {
      return metadataCharge;
    }

    /*
      2. Saved request/slip extra charge.
    */

    const savedValues = [
      payment?.extra_charge,
      slip?.extra_charge,
      request?.extra_charge
    ];

    for (const value of savedValues) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      const amount = Number(value);

      if (Number.isFinite(amount) && amount > 0) {
        return amount;
      }
    }

    /*
      3. If no saved charge exists,
      calculate using delivery date and slip date.

      For an Initial Payment slip, use slip creation
      date so an old initial payment does not get
      today's charge incorrectly.
    */

    const deliveryDate = slipGetDeliveryDate(request, slip);

    if (!deliveryDate) return 0;

    const referenceDate =
      slip?.created_at ||
      payment?.created_at ||
      payment?.payment_date ||
      new Date().toISOString();

    const delivery = new Date(deliveryDate);
    const reference = new Date(referenceDate);

    if (
      isNaN(delivery.getTime()) ||
      isNaN(reference.getTime())
    ) {
      return 0;
    }

    const deliveryDay = Date.UTC(
      delivery.getFullYear(),
      delivery.getMonth(),
      delivery.getDate()
    );

    const referenceDay = Date.UTC(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate()
    );

    const days = Math.floor(
      (referenceDay - deliveryDay) / 86400000
    );

    if (days < 0) return 0;

    return slipCalculateExtraCharge(days);
  }

  /* ==========================================
     DATABASE FIELD HELPERS
  ========================================== */

  function slipFindField(objects, aliases) {

    const normalizedAliases = aliases.map(key =>
      key.toLowerCase().replace(/[^a-z0-9]/g, "")
    );

    for (const object of objects) {

      if (!object || typeof object !== "object") continue;

      for (const key of Object.keys(object)) {

        const normalizedKey = key
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

        if (!normalizedAliases.includes(normalizedKey)) {
          continue;
        }

        const value = object[key];

        if (
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        ) {
          return value;
        }
      }
    }

    return null;
  }

  /* ==========================================
     CYLINDER TYPE
  ========================================== */

  function slipGetCylinderType(slip, request) {

    const value = slipFindField(
      [slip, request],
      [
        "cylinder_type",
        "lpg_cylinder_type",
        "cylinder_category",
        "gas_type",
        "connection_type",
        "cylinderType",
        "lpg_type",
        "cylinder_type_snapshot",
        "product_type"
      ]
    );

    if (!value) return "N/A";

    return slipStatus(value);
  }

  /* ==========================================
     CYLINDER WEIGHT
  ========================================== */

  function slipGetCylinderWeight(slip, request) {

    const value = slipFindField(
      [slip, request],
      [
        "cylinder_weight",
        "weight",
        "cylinder_weight_kg",
        "weight_kg",
        "cylinder_size",
        "weight_snapshot",
        "cylinderWeight",
        "lpg_weight"
      ]
    );

    if (value === null) return "N/A";

    const weight = String(value).trim();

    if (/kg/i.test(weight)) {
      return weight;
    }

    return weight + " KG";
  }

  /* ==========================================
     CYLINDER AMOUNT
  ========================================== */

  function slipGetCylinderAmount(slip, request) {

    const value = slipFindField(
      [slip, request],
      [
        "cylinder_amount",
        "base_amount",
        "cylinder_price",
        "request_amount",
        "amount_before_charge",
        "base_cylinder_amount"
      ]
    );

    if (value !== null) {
      return Math.max(0, Number(value) || 0);
    }

    /*
      Fallback only if a dedicated cylinder amount
      field is unavailable.
    */

    return Math.max(
      0,
      Number(
        request?.total_amount ??
        slip?.total_amount ??
        0
      ) || 0
    );
  }

  /* ==========================================
     TOTAL AMOUNT
  ========================================== */

  function slipGetTotalAmount(cylinderAmount, extraCharge) {

    return Math.max(
      0,
      Number(cylinderAmount || 0) +
      Number(extraCharge || 0)
    );
  }

  /* ==========================================
     SUPABASE CLIENT
  ========================================== */

  function getSupabaseClient() {

    try {

      if (
        typeof supabaseClient !== "undefined" &&
        supabaseClient
      ) {
        return supabaseClient;
      }

    } catch (error) {
      console.warn("Supabase client unavailable:", error);
    }

    return null;
  }

  /* ==========================================
     DATABASE FETCH
  ========================================== */

  async function fetchLatestPayment(paymentId) {

    const client = getSupabaseClient();

    if (!client || !paymentId) return null;

    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      console.error("Payment fetch error:", error);
      return null;
    }

    return data;
  }

  async function fetchLatestRequest(requestId) {

    const client = getSupabaseClient();

    if (!client || !requestId) return null;

    const { data, error } = await client
      .from("cylinder_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      console.error("Request fetch error:", error);
      return null;
    }

    return data;
  }

  async function fetchLatestSlip(requestId, paymentId) {

    const client = getSupabaseClient();

    if (!client || !requestId || !paymentId) return null;

    const { data, error } = await client
      .from("request_slips")
      .select("*")
      .eq("request_id", requestId)
      .eq("payment_id", paymentId)
      .eq("slip_status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Slip fetch error:", error);
      return null;
    }

    return data || null;
  }

  async function fetchLatestRequestPayments(requestId) {

    const client = getSupabaseClient();

    if (!client || !requestId) return [];

    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Payment history error:", error);
      return [];
    }

    return data || [];
  }

  /* ==========================================
     SLIP MATCHING
  ========================================== */

  function getSlipForPayment(payment) {

    const slips = Array.isArray(window.currentSlips)
      ? window.currentSlips
      : [];

    if (!payment) return null;

    const paymentId = String(payment.id || "");
    const requestId = String(payment.request_id || "");

    if (!requestId) return null;

    const activeSlips = slips.filter(slip =>
      String(slip.request_id || "") === requestId &&
      String(slip.slip_status || "").trim().toLowerCase() === "active"
    );

    const exactMatch = activeSlips.find(slip =>
      String(slip.payment_id || "") === paymentId
    );

    if (exactMatch) {
      return exactMatch;
    }

    /*
      Repayment can use the original active request slip.
    */

    const requestMatch = activeSlips.find(slip =>
      String(slip.request_id || "") === requestId
    );

    if (requestMatch) {
      return requestMatch;
    }

    console.error("Matching E-Slip not found:", {
      payment_id: paymentId,
      request_id: requestId,
      available_slips: slips
    });

    return null;
  }

  /* ==========================================
     STATUS HELPERS
  ========================================== */

  function getAgencyStatus(request, slip) {

    return (
      request?.agency_status ||
      request?.agency_approval ||
      request?.agency_delivery_status ||
      slip?.agency_status ||
      "Pending"
    );
  }

  function getDeliveryStatus(request, slip) {

    const deliveryDate = slipGetDeliveryDate(request, slip);

    const status =
      request?.delivery_status ||
      request?.delivery_state ||
      slip?.delivery_status ||
      "";

    if (
      deliveryDate ||
      ["delivered", "completed", "success", "successful"]
        .includes(slipNormalize(status))
    ) {
      return "Delivered";
    }

    if (slipIsRejected(status)) {
      return "Delivery Rejected";
    }

    return "Pending";
  }

  function getOwnerPaymentStatus(payment) {

    if (slipIsOwnerApproved(payment)) {
      return "Approved";
    }

    if (
      slipIsRejected(payment?.verification_status) ||
      slipIsRejected(payment?.payment_status) ||
      slipIsRejected(payment?.status)
    ) {
      return "Rejected";
    }

    return "Pending Verification";
  }

  /* ==========================================
     PAYMENT HISTORY ROWS
  ========================================== */

  function createPaymentRows(payments) {

    if (!Array.isArray(payments) || !payments.length) {

      return `
        <tr>
          <td colspan="5">No payment history available</td>
        </tr>
      `;
    }

    return payments.map(payment => {

      const type = slipGetPaymentType(payment);
      const amount = slipGetPaymentAmount(payment);

      const date =
        payment.payment_date ||
        payment.paid_at ||
        payment.created_at;

      const status = getOwnerPaymentStatus(payment);

      const approval = slipStatus(
        slipGetPaymentApproval(payment) || "Pending"
      );

      return `
        <tr>
          <td>${slipEscape(type)}</td>
          <td>${slipEscape(slipDateTime(date))}</td>
          <td>${slipMoney(amount)}</td>
          <td>${slipEscape(status)}</td>
          <td>${slipEscape(approval)}</td>
        </tr>
      `;

    }).join("");
  }

  /* ==========================================
     GENERATE E-SLIP HTML
  ========================================== */

  function createESlipHtml(slip, request, payments, selectedPayment) {

    if (!slip) {

      return `
        <!DOCTYPE html>
        <html>
        <body style="font-family:Arial;padding:30px">
          <h2>E-Slip not found</h2>
        </body>
        </html>
      `;
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
      slip.request_number_snapshot ||
      slip.request_number ||
      "N/A";

    const slipNumber = slip.slip_number || "N/A";

    const historical =
      slip.slip_type === "historical_recovery";

    const ownerStatus = getOwnerPaymentStatus(selectedPayment);

    const agencyStatus = getAgencyStatus(request, slip);

    const deli// Get latest Delivery Status from current cylinder request
const deliveryStatus = (
  request?.delivery_status ||
  slip?.delivery_status ||
  "Pending"
).toString().trim();

    const deliveryDate = slipGetDeliveryDate(request, slip);

    const requestStatus = slipStatus(
      slipGetRequestStatus(request)
    );

    const paymentRows = createPaymentRows(payments);

    /* ==========================================
       PAYMENT & CYLINDER CALCULATIONS
    ========================================== */

    const paymentAmount = slipGetPaymentAmount(selectedPayment);

    const cylinderAmount = slipGetCylinderAmount(slip, request);

    const extraCharge = slipGetExtraCharge(
      selectedPayment,
      slip,
      request
    );

    /*
      Cylinder Amount + Extra Charge.
      This avoids adding the same charge twice.
    */

    const totalAmount = slipGetTotalAmount(
      cylinderAmount,
      extraCharge
    );

    const cylinderType = slipGetCylinderType(slip, request);

    const cylinderWeight = slipGetCylinderWeight(slip, request);

    const quantity =
      request?.quantity ??
      request?.cylinder_quantity ??
      slip?.quantity ??
      slip?.cylinder_quantity ??
      1;

    const slipGeneratedDate =
      slip.created_at ||
      selectedPayment?.created_at;

    let logoUrl = "";

    try {
      logoUrl = new URL(
        "assets/EGC - Emergency Gas Cylinder logo.png",
        window.location.href
      ).href;
    } catch (error) {
      console.warn("Logo URL error:", error);
    }

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

html {
  width: 100%;
  overflow-x: hidden;
}

body {
  margin: 0;
  padding: 25px;
  background: #f1f5f9;
  font-family: Arial, sans-serif;
  color: #172033;
  width: 100%;
  overflow-x: hidden;
}

.slip {
  width: 100%;
  max-width: 800px;
  margin: auto;
  padding: 30px;
  background: white;
  border: 1px solid #dce3ed;
  border-radius: 12px;
  min-width: 0;
}

/* HEADER */

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #dbeafe;
  padding-bottom: 22px;
  gap: 15px;
  min-width: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.logo-img {
  width: 110px;
  height: auto;
  max-height: 65px;
  object-fit: contain;
  flex-shrink: 0;
}

.header-title {
  font-size: 22px;
  font-weight: 800;
  color: #174b7c;
  overflow-wrap: anywhere;
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
  flex-shrink: 0;
}

/* STATUS */

.status-box {
  margin-top: 20px;
  padding: 15px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  min-width: 0;
}

.status-box h3 {
  margin: 0 0 12px;
  color: #174b7c;
  font-size: 15px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.status-item {
  min-width: 0;
  padding: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  overflow-wrap: anywhere;
}

.status-label {
  display: block;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 6px;
}

.status-value {
  font-size: 13px;
  font-weight: bold;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pending-text {
  color: #b7791f;
}

.approved-text {
  color: #087443;
}

.rejected-text {
  color: #dc2626;
}

/* HISTORICAL */

.historical {
  background: #fff7ed;
  color: #9a3412;
  padding: 12px;
  margin-top: 18px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

/* SECTIONS */

.section {
  margin-top: 25px;
  min-width: 0;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
  min-width: 0;
}

.field {
  padding: 12px;
  background: #f8fafc;
  border-radius: 7px;
  min-width: 0;
  width: 100%;
  overflow-wrap: anywhere;
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
  word-break: break-word;
}

/* TABLE */

.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 12px;
}

th,
td {
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
  line-height: 1.8;
  font-size: 15px;
  overflow-wrap: anywhere;
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
  min-width: 0;
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

/* TABLET */

@media (max-width: 900px) {
  body {
    padding: 16px;
  }

  .slip {
    padding: 22px;
  }

  .header-title {
    font-size: 19px;
  }

  .logo-img {
    width: 90px;
  }
}

/* MOBILE */

@media (max-width: 600px) {
  body {
    padding: 10px;
  }

  .slip {
    width: 100%;
    padding: 14px;
    border-radius: 9px;
  }

  .header {
    align-items: center;
    gap: 7px;
    padding-bottom: 14px;
  }

  .header-left {
    gap: 7px;
    flex: 1;
  }

  .logo-img {
    width: 62px;
    max-height: 44px;
  }

  .header-title {
    font-size: 14px;
    line-height: 1.3;
  }

  .subtitle {
    font-size: 9px;
  }

  .slip-title {
    font-size: 8px;
    padding: 7px 8px;
    white-space: normal;
    max-width: 115px;
  }

  /* TWO BOXES PER ROW */

  .grid,
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  /* ODD LAST BOX TAKES FULL WIDTH */

  .grid > *:last-child:nth-child(odd),
  .status-grid > *:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }

  .field,
  .status-item {
    width: 100%;
    min-width: 0;
    padding: 10px;
  }

  .label,
  .status-label {
    font-size: 10px;
    line-height: 1.4;
  }

  .value,
  .status-value {
    font-size: 12px;
    line-height: 1.45;
  }

  .status-box {
    padding: 11px;
    margin-top: 15px;
  }

  .status-box h3 {
    font-size: 14px;
  }

  .section {
    margin-top: 19px;
  }

  .section h3 {
    font-size: 14px;
  }

  .historical {
    font-size: 11px;
    padding: 10px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    font-size: 10px;
    min-width: 570px;
  }

  th,
  td {
    padding: 8px 5px;
  }

  .total {
    font-size: 12px;
    padding: 12px;
    line-height: 1.7;
  }

  .verification {
    padding: 14px 10px;
  }

  .code {
    font-size: 16px;
    letter-spacing: 1.5px;
  }

  .footer {
    font-size: 10px;
  }

  .print-btn {
    width: 100%;
    max-width: 260px;
  }
}

/* VERY SMALL MOBILE */

@media (max-width: 360px) {
  body {
    padding: 6px;
  }

  .slip {
    padding: 10px;
  }

  .header {
    gap: 5px;
  }

  .logo-img {
    width: 52px;
  }

  .header-title {
    font-size: 12px;
  }

  .subtitle {
    font-size: 8px;
  }

  .slip-title {
    font-size: 7px;
    padding: 6px;
    max-width: 95px;
  }

  .grid,
  .status-grid {
    gap: 7px;
  }

  .field,
  .status-item {
    padding: 8px;
  }

  .label,
  .status-label {
    font-size: 9px;
  }

  .value,
  .status-value {
    font-size: 11px;
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
  .verification,
  .status-item {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>

</head>

<body>

<div class="slip">

  <div class="header">

    <div class="header-left">

      <img
        src="${slipEscape(logoUrl)}"
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

  ${historical ? `

    <div class="historical">

      <strong>Historical E-Slip Copy</strong><br>

      This slip has been generated from preserved historical records.

      It is not a new payment approval or agency release.

    </div>

  ` : ""}

  <div class="status-box">

    <h3>Current Request Status</h3>

    <div class="status-grid">

      <div class="status-item">
        <span class="status-label">Payment Owner Approval</span>
        <span class="status-value approved-text">
          ${slipEscape(ownerStatus)}
        </span>
      </div>

      <div class="status-item">
        <span class="status-label">Agency Status</span>
        <span class="status-value ${
          slipIsApproved(agencyStatus) ? "approved-text" : "pending-text"
        }">
          ${slipEscape(slipStatus(agencyStatus))}
        </span>
      </div>

      <div class="status-item">
<span class="status-value ${
  deliveryStatus.toLowerCase() === "delivered"
    ? "approved-text"
    : "pending-text"
}">
  ${slipEscape(deliveryStatus)}
</span>
      </div>

      <div class="status-item">
        <span class="status-label">Request Status</span>
        <span class="status-value">
          ${slipEscape(requestStatus)}
        </span>
      </div>

    </div>

  </div>

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
        <span class="value">${slipDate(slipGeneratedDate)}</span>
      </div>

      <div class="field">
        <span class="label">Payment Status</span>
        <span class="value">${slipEscape(slipStatus(ownerStatus))}</span>
      </div>

    </div>

  </div>

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

  <div class="section">

    <h3>LPG & Agency Details</h3>

    <div class="grid">

      <div class="field">
        <span class="label">Cylinder Type</span>
        <span class="value">${slipEscape(cylinderType)}</span>
      </div>

      <div class="field">
        <span class="label">Cylinder Weight</span>
        <span class="value">${slipEscape(cylinderWeight)}</span>
      </div>

      <div class="field">
        <span class="label">LPG Company</span>
        <span class="value">${slipEscape(slip.lpg_company || request?.lpg_company || "N/A")}</span>
      </div>

      <div class="field">
        <span class="label">Agency Name</span>
        <span class="value">${slipEscape(slip.agency_name || request?.agency_name || "N/A")}</span>
      </div>

      <div class="field">
        <span class="label">Cylinder Quantity</span>
        <span class="value">${slipEscape(quantity)}</span>
      </div>

      <div class="field">
        <span class="label">Agency Status</span>
        <span class="value">${slipEscape(slipStatus(agencyStatus))}</span>
      </div>

      <div class="field">
        <span class="label">Delivery Status</span>
        <span class="value">${slipEscape(deliveryStatus)}</span>
      </div>

      <div class="field">
        <span class="label">Delivery Date</span>
        <span class="value">${slipDate(deliveryDate)}</span>
      </div>

    </div>

  </div>

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
            <th>Owner Approval</th>
          </tr>
        </thead>

        <tbody>
          ${paymentRows}
        </tbody>

      </table>

    </div>

    <div class="total">

      <div>
        Cylinder Amount:
        <strong>${slipMoney(cylinderAmount)}</strong>
      </div>

      <div>
        Extra Charge:
        <strong>${slipMoney(extraCharge)}</strong>
      </div>

      <div>
        Selected Payment Amount:
        <strong>${slipMoney(paymentAmount)}</strong>
      </div>

      <div>
        Payment Type:
        <strong>${slipEscape(slipGetPaymentType(selectedPayment))}</strong>
      </div>

      <div>
        Total Amount:
        <strong>${slipMoney(totalAmount)}</strong>
      </div>

    </div>

  </div>

  <div class="verification">

    <div>Slip Verification Code</div>

    <div class="code">
      ${slipEscape(slip.verification_code || "N/A")}
    </div>

    <small>Keep this code for your records.</small>

  </div>

  <div class="footer">

    <strong>EGC - Emergency Gas Cylinder</strong>
    <br>
    This is a system-generated E-Slip.
    <br>
    Please keep it safe for future reference.
    <br>
    Last Status Checked: ${slipDateTime(new Date())}
    <br>
    EGC Developed by Sarbaj

  </div>

</div>

<button class="print-btn" onclick="
  if (window.AndroidEGC && window.AndroidEGC.printSlip) {
    window.AndroidEGC.printSlip(
      document.documentElement.outerHTML,
      'EGC-Payment-Slip'
    );
  } else {
    window.print();
  }
">
  Print / Save PDF
</button>

</body>
</html>

`;
  }

  /* ==========================================
     GET FRESH SLIP DATA
  ========================================== */

  async function getFreshSlipData(paymentId) {

    const oldPayment = (window.currentPayments || []).find(
      item => String(item.id) === String(paymentId)
    );

    if (!oldPayment) {
      throw new Error("Payment record not found.");
    }

    const payment =
      await fetchLatestPayment(paymentId) || oldPayment;

    if (!slipIsOwnerApproved(payment)) {
      throw new Error(
        "E-Slip is available only after Owner payment approval."
      );
    }

    const requestId = payment.request_id;

    if (!requestId) {
      throw new Error("Payment Request ID is missing.");
    }

    const request =
      await fetchLatestRequest(requestId) ||
      (window.currentRequests || []).find(
        item => String(item.id) === String(requestId)
      );

    if (!request) {
      throw new Error("Cylinder request record not found.");
    }

    let slip = getSlipForPayment(payment);

    if (!slip) {
      slip = await fetchLatestSlip(requestId, payment.id);
    }

    if (!slip) {

      console.error("Matching E-Slip not found:", {
        payment_id: payment.id,
        request_id: requestId,
        available_slips: window.currentSlips || []
      });

      throw new Error(
        "Payment is approved, but its matching E-Slip record has not been generated yet. Please contact EGC Owner."
      );
    }

    const payments =
      await fetchLatestRequestPayments(requestId);

    return {
      payment,
      request,
      slip,
      payments
    };
  }

 /* ==========================================
   EGC SLIP VIEW MODAL
========================================== */

function closeESlipModal() {

  const oldModal = document.getElementById("egcSlipModal");

  if (oldModal) {
    oldModal.remove();
  }

}

/* ==========================================
   OPEN E-SLIP
========================================== */

async function openPaymentSlip(paymentId) {

  try {

    const result = await getFreshSlipData(paymentId);

    const html = createESlipHtml(
      result.slip,
      result.request,
      result.payments,
      result.payment
    );

    closeESlipModal();

    const modal = document.createElement("div");

    modal.id = "egcSlipModal";

    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0,0,0,0.75);
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    `;

    const toolbar = document.createElement("div");

    toolbar.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: #ffffff;
      min-height: 55px;
      flex-shrink: 0;
    `;

    const title = document.createElement("strong");

    title.textContent = "EGC Payment Slip";

    title.style.cssText = `
      font-size: 15px;
      color: #174b7c;
    `;

    const closeButton = document.createElement("button");

    closeButton.textContent = "✕ Close";

    closeButton.style.cssText = `
      border: none;
      background: #dc2626;
      color: white;
      padding: 9px 16px;
      border-radius: 6px;
      font-weight: bold;
    `;

    closeButton.onclick = closeESlipModal;

    toolbar.appendChild(title);
    toolbar.appendChild(closeButton);

    const iframe = document.createElement("iframe");

    iframe.style.cssText = `
      flex: 1;
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    `;

    iframe.setAttribute("title", "EGC Payment Slip");

    modal.appendChild(toolbar);
    modal.appendChild(iframe);

    document.body.appendChild(modal);

    iframe.srcdoc = html;

    // Close modal when user clicks outside the slip toolbar.
    modal.addEventListener("click", function(event) {

      if (event.target === modal) {
        closeESlipModal();
      }

    });

  } catch (error) {

    console.error("Open E-Slip Error:", error);

    alert(error.message || "Unable to open E-Slip.");

  }

}

/* ==========================================
   DOWNLOAD E-SLIP AS PDF
========================================== */

async function downloadPaymentSlip(paymentId) {

  try {

    const result = await getFreshSlipData(paymentId);

    const html = createESlipHtml(
      result.slip,
      result.request,
      result.payments,
      result.payment
    );

    const fileName =
      "EGC-" +
      (result.slip.slip_number || "ESlip");

    // Android App: Open native Android Print / Save PDF.
    if (
      window.AndroidEGC &&
      typeof window.AndroidEGC.printSlip === "function"
    ) {

      window.AndroidEGC.printSlip(
        html,
        fileName
      );

      return;
    }

    // Website: Open printable slip in a new tab.
    const printWindow = window.open("", "_blank");

    if (!printWindow) {

      alert("Please allow pop-ups to print your E-Slip.");

      return;
    }

    printWindow.document.open();

    printWindow.document.write(html);

    printWindow.document.close();

    printWindow.onload = function() {

      printWindow.focus();

      setTimeout(function() {
        printWindow.print();
      }, 500);

    };

  } catch (error) {

    console.error("Download E-Slip Error:", error);

    alert(error.message || "Unable to download E-Slip.");

  }

}

  /* ==========================================
     EXPOSE FUNCTIONS
  ========================================== */

  window.createESlipHtml = createESlipHtml;
  window.getSlipForPayment = getSlipForPayment;
  window.getFreshSlipData = getFreshSlipData;
  window.openPaymentSlip = openPaymentSlip;
  window.downloadPaymentSlip = downloadPaymentSlip;

})();