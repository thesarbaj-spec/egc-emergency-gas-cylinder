/* =========================================================
   EGC AGENCY PANEL
   AGENCY SLIPS
   ========================================================= */


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL = "https://szefvmvokkhvnzryodqu.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_S8aSsfmOKN6_7laRfgoMKA_Re2HzRS6";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


/* =========================================================
   GLOBAL DATA
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let currentAgency = null;

let agencyId = null;

let allSlips = [];
let filteredSlips = [];

let selectedSlip = null;


/* =========================================================
   HELPERS
   ========================================================= */

function firstValue() {
    for (let i = 0; i < arguments.length; i++) {
        const value = arguments[i];

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
            return value;
        }
    }

    return "";
}


function escapeHtml(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "₹0";
    }

    return "₹" + amount.toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}


function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


function normalizeStatus(value) {
    const status = String(
        firstValue(value, "pending")
    )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    return status;
}


function statusClass(value) {
    const status = normalizeStatus(value);

    if (
        status === "pending" ||
        status === "pending_approval" ||
        status === "on_hold"
    ) {
        return "status-pending";
    }

    if (status === "approved") {
        return "status-approved";
    }

    if (status === "paid") {
        return "status-paid";
    }

    if (status === "completed") {
        return "status-completed";
    }

    if (
        status === "rejected" ||
        status === "reject"
    ) {
        return "status-rejected";
    }

    if (
        status === "cancelled" ||
        status === "canceled"
    ) {
        return "status-cancelled";
    }

    return "status-default";
}


function statusText(value) {
    const status = normalizeStatus(value);

    if (!status) {
        return "Pending";
    }

    return status
        .replace(/_/g, " ")
        .replace(/\b\w/g, function(letter) {
            return letter.toUpperCase();
        });
}


function showToast(message, type) {
    const toast = document.getElementById("toast");

    if (!toast) {
        return;
    }

    toast.textContent = message || "";
    toast.className = "toast show";

    if (type) {
        toast.classList.add(type);
    }

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(function() {
        toast.className = "toast";
    }, 3000);
}


/* =========================================================
   AUTH + AGENCY
   ========================================================= */

async function loadAgency() {
    try {
        const {
            data: userData,
            error: userError
        } = await supabaseClient.auth.getUser();

        if (
            userError ||
            !userData ||
            !userData.user
        ) {
            window.location.href = "agency-login.html";
            return false;
        }

        currentUser = userData.user;

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (
            profileError ||
            !profile
        ) {
            console.error(
                "Profile error:",
                profileError
            );

            showToast(
                "Agency profile not found.",
                "error"
            );

            return false;
        }

        currentProfile = profile;

        agencyId = firstValue(
            profile.agency_id,
            profile.agencyId
        );

        if (!agencyId) {
            showToast(
                "No agency is linked to this account.",
                "error"
            );

            return false;
        }

        const {
            data: agency,
            error: agencyError
        } = await supabaseClient
            .from("agencies")
            .select("*")
            .eq("id", agencyId)
            .maybeSingle();

        if (
            agencyError ||
            !agency
        ) {
            console.error(
                "Agency error:",
                agencyError
            );

            showToast(
                "Agency details could not be loaded.",
                "error"
            );

            return false;
        }

        currentAgency = agency;

        const agencyName = firstValue(
            agency.name,
            agency.agency_name,
            agency.agencyName,
            "Agency"
        );

        const headerAgencyName =
            document.getElementById(
                "headerAgencyName"
            );

        if (headerAgencyName) {
            headerAgencyName.textContent = agencyName;
        }

        return true;

    } catch (error) {
        console.error(
            "loadAgency error:",
            error
        );

        showToast(
            "Unable to load agency.",
            "error"
        );

        return false;
    }
}


/* =========================================================
   PROFILES
   ========================================================= */

async function loadAgencyProfiles() {
    try {
        const {
            data,
            error
        } = await supabaseClient
            .from("profiles")
            .select("*");

        if (error) {
            console.error(
                "Profiles error:",
                error
            );

            return [];
        }

        return data || [];

    } catch (error) {
        console.error(
            "Profiles exception:",
            error
        );

        return [];
    }
}


function createProfileMap(profiles) {
    const map = {};

    (profiles || []).forEach(function(profile) {
        if (profile && profile.id) {
            map[profile.id] = profile;
        }
    });

    return map;
}


function getCustomerName(record, profileMap) {
    const userId = firstValue(
        record.user_id,
        record.userId,
        record.customer_id,
        record.customerId
    );

    const profile =
        userId && profileMap[userId]
            ? profileMap[userId]
            : null;

    return firstValue(
        record.full_name,
        record.customer_name,
        record.customerName,
        profile && profile.full_name,
        profile && profile.name,
        profile && profile.display_name,
        profile && profile.email,
        profile && profile.mobile,
        "Customer"
    );
}


/* =========================================================
   SLIP NUMBERS
   ========================================================= */

function getRequestNumber(record) {
    return firstValue(
        record.request_number,
        record.request_no,
        record.request_id_number,
        record.request_code,
        record.reference_number,
        record.reference_no,
        record.id
            ? "REQ-" +
              String(record.id)
                  .slice(0, 8)
                  .toUpperCase()
            : ""
    );
}


function getRequestSlipNumber(record) {
    return firstValue(
        record.slip_number,
        record.slip_no,
        record.request_slip_number,
        record.request_slip_no,
        record.request_number
            ? "REQ-SLIP-" +
              String(record.request_number)
            : record.id
                ? "REQ-SLIP-" +
                  String(record.id)
                      .slice(0, 8)
                      .toUpperCase()
                : "REQ-SLIP"
    );
}


function getPaymentSlipNumber(record) {
    return firstValue(
        record.slip_number,
        record.slip_no,
        record.payment_slip_number,
        record.payment_slip_no,
        record.payment_number
            ? "PAY-SLIP-" +
              String(record.payment_number)
            : record.transaction_id
                ? "PAY-SLIP-" +
                  String(record.transaction_id)
                      .slice(0, 8)
                      .toUpperCase()
                : record.id
                    ? "PAY-SLIP-" +
                      String(record.id)
                          .slice(0, 8)
                          .toUpperCase()
                    : "PAY-SLIP"
    );
}


/* =========================================================
   LOAD REQUESTS
   ========================================================= */

async function loadRequests() {
    try {
        const query = supabaseClient
            .from("cylinder_requests")
            .select("*")
            .eq("agency_id", agencyId);

        const {
            data,
            error
        } = await query;

        if (error) {
            console.error(
                "Requests error:",
                error
            );

            return [];
        }

        return data || [];

    } catch (error) {
        console.error(
            "Requests exception:",
            error
        );

        return [];
    }
}


/* =========================================================
   LOAD PAYMENTS
   ========================================================= */

async function loadPayments() {
    try {
        const query = supabaseClient
            .from("payments")
            .select("*")
            .eq("agency_id", agencyId);

        const {
            data,
            error
        } = await query;

        if (error) {
            console.error(
                "Payments error:",
                error
            );

            return [];
        }

        return data || [];

    } catch (error) {
        console.error(
            "Payments exception:",
            error
        );

        return [];
    }
}


/* =========================================================
   CREATE REQUEST SLIPS
   ========================================================= */

function createRequestSlips(
    requests,
    profileMap
) {
    return (requests || []).map(function(request) {

        const requestNumber =
            getRequestNumber(request);

        const slipNumber =
            getRequestSlipNumber(request);

        const status =
            firstValue(
                request.status,
                request.request_status,
                request.approval_status,
                "pending"
            );

        const amount =
            Number(
                firstValue(
                    request.amount,
                    request.request_amount,
                    request.total_amount,
                    0
                )
            ) || 0;

        const date =
            firstValue(
                request.created_at,
                request.requested_at,
                request.updated_at
            );

        return {
            id: request.id,
            sourceId: request.id,
            type: "request",
            slipNumber: slipNumber,
            requestNumber: requestNumber,
            customerName:
                getCustomerName(
                    request,
                    profileMap
                ),
            amount: amount,
            status: status,
            date: date,
            raw: request
        };
    });
}


/* =========================================================
   CREATE PAYMENT SLIPS
   ========================================================= */

function createPaymentSlips(
    payments,
    profileMap
) {
    return (payments || []).map(function(payment) {

        const requestNumber =
            firstValue(
                payment.request_number,
                payment.request_no,
                payment.request_id
                    ? "REQ-" +
                      String(payment.request_id)
                          .slice(0, 8)
                          .toUpperCase()
                    : ""
            );

        const slipNumber =
            getPaymentSlipNumber(payment);

        const status =
            firstValue(
                payment.status,
                payment.payment_status,
                "pending"
            );

        const amount =
            Number(
                firstValue(
                    payment.amount,
                    payment.payment_amount,
                    payment.total_amount,
                    0
                )
            ) || 0;

        const date =
            firstValue(
                payment.created_at,
                payment.payment_date,
                payment.paid_at,
                payment.updated_at
            );

        return {
            id: payment.id,
            sourceId: payment.id,
            type: "payment",
            slipNumber: slipNumber,
            requestNumber: requestNumber,
            customerName:
                getCustomerName(
                    payment,
                    profileMap
                ),
            amount: amount,
            status: status,
            date: date,
            raw: payment
        };
    });
}


/* =========================================================
   LOAD ALL SLIPS
   ========================================================= */

async function loadSlips() {
    const loading =
        document.getElementById("loadingState");

    const empty =
        document.getElementById("emptyState");

    const table =
        document.getElementById("tableWrap");

    if (loading) {
        loading.style.display = "block";
    }

    if (empty) {
        empty.style.display = "none";
    }

    if (table) {
        table.style.display = "none";
    }

    try {
        if (!agencyId) {
            return;
        }

        const results =
            await Promise.all([
                loadRequests(),
                loadAgencyProfiles(),
                loadPayments()
            ]);

        const requests = results[0];
        const profiles = results[1];
        const payments = results[2];

        const profileMap =
            createProfileMap(profiles);

        const requestSlips =
            createRequestSlips(
                requests,
                profileMap
            );

        const paymentSlips =
            createPaymentSlips(
                payments,
                profileMap
            );

        allSlips =
            requestSlips.concat(
                paymentSlips
            );

        allSlips.sort(function(a, b) {
            const aTime =
                a.date
                    ? new Date(a.date).getTime()
                    : 0;

            const bTime =
                b.date
                    ? new Date(b.date).getTime()
                    : 0;

            return bTime - aTime;
        });

        updateStats();

        updatePendingCount(
            requests,
            payments
        );

        applyFilters();

    } catch (error) {
        console.error(
            "loadSlips error:",
            error
        );

        if (loading) {
            loading.style.display = "none";
        }

        if (empty) {
            empty.style.display = "block";

            empty.innerHTML =
                "<div class='empty-icon'>⚠️</div>" +
                "<strong>Unable to load slips</strong>" +
                "<p style='margin-top:5px;'>" +
                    "Please refresh the page and try again." +
                "</p>";
        }
    }
}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {
    const requestCount =
        allSlips.filter(function(slip) {
            return slip.type === "request";
        }).length;

    const paymentItems =
        allSlips.filter(function(slip) {
            return slip.type === "payment";
        });

    const totalAmount =
        paymentItems.reduce(
            function(total, slip) {
                return total + (
                    Number(slip.amount) || 0
                );
            },
            0
        );

    const totalSlips =
        document.getElementById("totalSlips");

    const requestSlips =
        document.getElementById("requestSlips");

    const paymentSlips =
        document.getElementById("paymentSlips");

    const totalAmountElement =
        document.getElementById("totalAmount");

    if (totalSlips) {
        totalSlips.textContent =
            allSlips.length;
    }

    if (requestSlips) {
        requestSlips.textContent =
            requestCount;
    }

    if (paymentSlips) {
        paymentSlips.textContent =
            paymentItems.length;
    }

    if (totalAmountElement) {
        totalAmountElement.textContent =
            formatMoney(totalAmount);
    }
}


/* =========================================================
   PENDING COUNT
   ========================================================= */

function updatePendingCount(
    requests,
    payments
) {
    const items =
        []
            .concat(requests || [])
            .concat(payments || []);

    const pending =
        items.filter(function(item) {

            const status =
                normalizeStatus(
                    firstValue(
                        item.status,
                        item.request_status,
                        item.payment_status,
                        "pending"
                    )
                );

            return (
                status === "pending" ||
                status === "pending_approval" ||
                status === "on_hold"
            );

        }).length;

    const pendingNavCount =
        document.getElementById(
            "pendingNavCount"
        );

    if (pendingNavCount) {
        pendingNavCount.textContent =
            pending;
    }
}


/* =========================================================
   FILTERS
   ========================================================= */

function applyFilters() {
    const searchElement =
        document.getElementById(
            "searchInput"
        );

    const typeElement =
        document.getElementById(
            "typeFilter"
        );

    const statusElement =
        document.getElementById(
            "statusFilter"
        );

    const search =
        String(
            searchElement
                ? searchElement.value
                : ""
        )
            .trim()
            .toLowerCase();

    const type =
        typeElement
            ? typeElement.value
            : "all";

    const status =
        statusElement
            ? statusElement.value
            : "all";

    filteredSlips =
        allSlips.filter(function(slip) {

            if (
                type !== "all" &&
                slip.type !== type
            ) {
                return false;
            }

            if (status !== "all") {
                const slipStatus =
                    normalizeStatus(
                        slip.status
                    );

                if (
                    slipStatus !== status
                ) {
                    return false;
                }
            }

            if (search) {
                const searchable =
                    [
                        slip.slipNumber,
                        slip.requestNumber,
                        slip.customerName,
                        slip.status,
                        slip.type
                    ]
                        .join(" ")
                        .toLowerCase();

                if (
                    searchable.indexOf(search) === -1
                ) {
                    return false;
                }
            }

            return true;
        });

    renderSlips();
}


/* =========================================================
   RENDER
   ========================================================= */

function renderSlips() {
    const loading =
        document.getElementById(
            "loadingState"
        );

    const empty =
        document.getElementById(
            "emptyState"
        );

    const table =
        document.getElementById(
            "tableWrap"
        );

    const body =
        document.getElementById(
            "slipsBody"
        );

    if (loading) {
        loading.style.display = "none";
    }

    if (!body || !table || !empty) {
        return;
    }

    if (!filteredSlips.length) {
        table.style.display = "none";
        empty.style.display = "block";

        empty.innerHTML =
            "<div class='empty-icon'>📄</div>" +
            "<strong>No slips found</strong>" +
            "<p style='margin-top:5px;'>" +
                "Try changing your search or filters." +
            "</p>";

        body.innerHTML = "";

        return;
    }

    empty.style.display = "none";
    table.style.display = "block";

    body.innerHTML =
        filteredSlips.map(function(slip) {

            const typeLabel =
                slip.type === "request"
                    ? "Request"
                    : "Payment";

            const typeClass =
                slip.type === "request"
                    ? "type-request"
                    : "type-payment";

            const statusCls =
                statusClass(
                    slip.status
                );

            const statusLabel =
                statusText(
                    slip.status
                );

            const amount =
                slip.type === "payment"
                    ? formatMoney(slip.amount)
                    : "—";

            return (
                "<tr>" +

                    "<td>" +
                        "<span class='slip-number'>" +
                            escapeHtml(
                                slip.slipNumber
                            ) +
                        "</span>" +
                    "</td>" +

                    "<td>" +
                        "<span class='type-badge " +
                            typeClass +
                        "'>" +
                            escapeHtml(
                                typeLabel
                            ) +
                        "</span>" +
                    "</td>" +

                    "<td>" +
                        "<div class='customer-name'>" +
                            escapeHtml(
                                slip.customerName
                            ) +
                        "</div>" +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            slip.requestNumber || "—"
                        ) +
                    "</td>" +

                    "<td>" +
                        "<span class='amount'>" +
                            escapeHtml(amount) +
                        "</span>" +
                    "</td>" +

                    "<td>" +
                        "<span class='status-badge " +
                            statusCls +
                        "'>" +
                            escapeHtml(
                                statusLabel
                            ) +
                        "</span>" +
                    "</td>" +

                    "<td>" +
                        escapeHtml(
                            formatDate(slip.date)
                        ) +
                    "</td>" +

                    "<td>" +
                        "<button " +
                            "class='view-btn' " +
                            "data-slip-id='" +
                            escapeHtml(
                                String(slip.id)
                            ) +
                            "' " +
                            "data-slip-type='" +
                            escapeHtml(
                                slip.type
                            ) +
                        "'>" +
                            "View Slip" +
                        "</button>" +
                    "</td>" +

                "</tr>"
            );

        }).join("");

    document
        .querySelectorAll(".view-btn")
        .forEach(function(button) {

            button.addEventListener(
                "click",
                function() {

                    const id =
                        button.getAttribute(
                            "data-slip-id"
                        );

                    const type =
                        button.getAttribute(
                            "data-slip-type"
                        );

                    const slip =
                        filteredSlips.find(
                            function(item) {
                                return (
                                    String(item.id) ===
                                    String(id) &&
                                    item.type === type
                                );
                            }
                        );

                    if (slip) {
                        openSlipModal(slip);
                    }
                }
            );
        });
}


/* =========================================================
   SLIP MODAL
   ========================================================= */

function openSlipModal(slip) {
    selectedSlip = slip;

    const modal =
        document.getElementById(
            "slipModal"
        );

    const preview =
        document.getElementById(
            "slipPreview"
        );

    const title =
        document.getElementById(
            "slipModalTitle"
        );

    if (!modal || !preview || !title) {
        return;
    }

    const isPayment =
        slip.type === "payment";

    title.textContent =
        isPayment
            ? "Payment Slip"
            : "Request Slip";

    const raw =
        slip.raw || {};

    const agencyName =
        firstValue(
            currentAgency &&
                currentAgency.name,
            currentAgency &&
                currentAgency.agency_name,
            "Agency"
        );

    const mobile =
        firstValue(
            raw.mobile,
            raw.customer_mobile,
            raw.phone,
            raw.mobile_number,
            ""
        );

    const email =
        firstValue(
            raw.email,
            raw.customer_email,
            ""
        );

    const state =
        firstValue(
            raw.state,
            raw.state_name,
            ""
        );

    const district =
        firstValue(
            raw.district,
            raw.district_name,
            ""
        );

    const city =
        firstValue(
            raw.city,
            raw.city_name,
            ""
        );

    const lpgCompany =
        firstValue(
            raw.lpg_company,
            raw.company,
            raw.lpg_company_name,
            ""
        );

    const lpgAgency =
        firstValue(
            raw.lpg_agency,
            raw.agency_name,
            ""
        );

    preview.innerHTML =

        "<div class='slip-header'>" +

            "<div class='slip-brand'>" +

                "<img " +
                    "src='assets/EGC - Emergency Gas Cylinder logo.png' " +
                    "alt='EGC' " +
                    "onerror='this.style.display=\"none\"'>" +

                "<div>" +
                    "<h4>EGC - Emergency Gas Cylinder</h4>" +
                    "<p>" +
                        escapeHtml(agencyName) +
                    "</p>" +
                "</div>" +

            "</div>" +

        "</div>" +

        "<div class='slip-content'>" +

            "<div class='slip-grid'>" +

                field(
                    "Slip Number",
                    slip.slipNumber
                ) +

                field(
                    "Slip Type",
                    isPayment
                        ? "Payment Slip"
                        : "Request Slip"
                ) +

                field(
                    "Customer",
                    slip.customerName
                ) +

                field(
                    "Request Number",
                    slip.requestNumber
                ) +

                field(
                    "Amount",
                    isPayment
                        ? formatMoney(slip.amount)
                        : "Request Slip"
                ) +

                field(
                    "Status",
                    statusText(slip.status)
                ) +

                field(
                    "Date",
                    formatDateTime(slip.date)
                ) +

                field(
                    "Mobile",
                    mobile || "—"
                ) +

                field(
                    "Email",
                    email || "—"
                ) +

                field(
                    "State",
                    state || "—"
                ) +

                field(
                    "District",
                    district || "—"
                ) +

                field(
                    "City",
                    city || "—"
                ) +

                field(
                    "LPG Company",
                    lpgCompany || "—"
                ) +

                field(
                    "LPG Agency",
                    lpgAgency || "—"
                ) +

            "</div>" +

        "</div>" +

        "<div class='slip-footer'>" +
            "Generated by EGC Agency Panel • " +
            escapeHtml(
                formatDateTime(
                    new Date().toISOString()
                )
            ) +
        "</div>";

    modal.classList.add("show");
}


function field(label, value) {
    return (
        "<div class='slip-field'>" +

            "<label>" +
                escapeHtml(label) +
            "</label>" +

            "<strong>" +
                escapeHtml(
                    firstValue(value, "—")
                ) +
            "</strong>" +

        "</div>"
    );
}


function closeSlipModal() {
    const modal =
        document.getElementById(
            "slipModal"
        );

    if (modal) {
        modal.classList.remove("show");
    }

    selectedSlip = null;
}


/* =========================================================
   PRINT
   ========================================================= */

function printSelectedSlip() {
    if (!selectedSlip) {
        return;
    }

    const slip =
        selectedSlip;

    const raw =
        slip.raw || {};

    const agencyName =
        firstValue(
            currentAgency &&
                currentAgency.name,
            currentAgency &&
                currentAgency.agency_name,
            "Agency"
        );

    const isPayment =
        slip.type === "payment";

    const mobile =
        firstValue(
            raw.mobile,
            raw.customer_mobile,
            raw.phone,
            raw.mobile_number,
            "—"
        );

    const email =
        firstValue(
            raw.email,
            raw.customer_email,
            "—"
        );

    const state =
        firstValue(
            raw.state,
            raw.state_name,
            "—"
        );

    const district =
        firstValue(
            raw.district,
            raw.district_name,
            "—"
        );

    const city =
        firstValue(
            raw.city,
            raw.city_name,
            "—"
        );

    const lpgCompany =
        firstValue(
            raw.lpg_company,
            raw.company,
            raw.lpg_company_name,
            "—"
        );

    const lpgAgency =
        firstValue(
            raw.lpg_agency,
            raw.agency_name,
            "—"
        );

    const printWindow =
        window.open(
            "",
            "_blank",
            "width=900,height=700"
        );

    if (!printWindow) {
        showToast(
            "Please allow popups to print the slip.",
            "error"
        );

        return;
    }

    const printableHtml =
        "<!DOCTYPE html>" +

        "<html lang='en'>" +

        "<head>" +

            "<meta charset='UTF-8'>" +

            "<title>" +
                escapeHtml(
                    slip.slipNumber
                ) +
            "</title>" +

            "<style>" +

                "*{box-sizing:border-box}" +

                "body{" +
                    "font-family:Arial,Helvetica,sans-serif;" +
                    "margin:0;" +
                    "padding:30px;" +
                    "color:#17344a;" +
                    "background:#fff;" +
                "}" +

                ".sheet{" +
                    "max-width:800px;" +
                    "margin:0 auto;" +
                    "border:1px solid #d8e5ed;" +
                    "border-radius:12px;" +
                    "overflow:hidden;" +
                "}" +

                ".head{" +
                    "display:flex;" +
                    "align-items:center;" +
                    "gap:14px;" +
                    "padding:20px;" +
                    "background:#f2f8fc;" +
                    "border-bottom:1px solid #d8e5ed;" +
                "}" +

                ".head img{" +
                    "width:58px;" +
                    "height:58px;" +
                    "object-fit:contain;" +
                "}" +

                ".head h1{" +
                    "margin:0;" +
                    "font-size:22px;" +
                    "color:#06477f;" +
                "}" +

                ".head p{" +
                    "margin:5px 0 0;" +
                    "font-size:12px;" +
                    "color:#6c8294;" +
                "}" +

                ".title{" +
                    "padding:18px 20px 8px;" +
                    "font-size:17px;" +
                    "font-weight:800;" +
                    "color:#0871c3;" +
                "}" +

                ".grid{" +
                    "display:grid;" +
                    "grid-template-columns:1fr 1fr;" +
                    "gap:12px;" +
                    "padding:12px 20px 20px;" +
                "}" +

                ".item{" +
                    "border:1px solid #e2edf3;" +
                    "background:#fafcfd;" +
                    "border-radius:8px;" +
                    "padding:11px;" +
                "}" +

                ".item label{" +
                    "display:block;" +
                    "font-size:9px;" +
                    "font-weight:800;" +
                    "text-transform:uppercase;" +
                    "color:#8498a6;" +
                "}" +

                ".item strong{" +
                    "display:block;" +
                    "font-size:12px;" +
                    "margin-top:5px;" +
                    "word-break:break-word;" +
                "}" +

                ".footer{" +
                    "border-top:1px solid #d8e5ed;" +
                    "padding:14px 20px;" +
                    "text-align:center;" +
                    "font-size:10px;" +
                    "color:#8295a2;" +
                "}" +

                "@media print{" +
                    "body{padding:0}" +
                    ".sheet{border:0}" +
                "}" +

            "</style>" +

        "</head>" +

        "<body>" +

            "<div class='sheet'>" +

                "<div class='head'>" +

                    "<img " +
                        "src='assets/EGC - Emergency Gas Cylinder logo.png' " +
                        "alt='EGC'>" +

                    "<div>" +

                        "<h1>" +
                            "EGC - Emergency Gas Cylinder" +
                        "</h1>" +

                        "<p>" +
                            escapeHtml(agencyName) +
                        "</p>" +

                    "</div>" +

                "</div>" +

                "<div class='title'>" +
                    escapeHtml(
                        isPayment
                            ? "Payment Slip"
                            : "Request Slip"
                    ) +
                "</div>" +

                "<div class='grid'>" +

                    printField(
                        "Slip Number",
                        slip.slipNumber
                    ) +

                    printField(
                        "Slip Type",
                        isPayment
                            ? "Payment Slip"
                            : "Request Slip"
                    ) +

                    printField(
                        "Customer",
                        slip.customerName
                    ) +

                    printField(
                        "Request Number",
                        slip.requestNumber
                    ) +

                    printField(
                        "Amount",
                        isPayment
                            ? formatMoney(slip.amount)
                            : "—"
                    ) +

                    printField(
                        "Status",
                        statusText(slip.status)
                    ) +

                    printField(
                        "Date",
                        formatDateTime(slip.date)
                    ) +

                    printField(
                        "Mobile",
                        mobile
                    ) +

                    printField(
                        "Email",
                        email
                    ) +

                    printField(
                        "State",
                        state
                    ) +

                    printField(
                        "District",
                        district
                    ) +

                    printField(
                        "City",
                        city
                    ) +

                    printField(
                        "LPG Company",
                        lpgCompany
                    ) +

                    printField(
                        "LPG Agency",
                        lpgAgency
                    ) +

                "</div>" +

                "<div class='footer'>" +
                    "Generated by EGC Agency Panel" +
                "</div>" +

            "</div>" +

        "</body>" +

        "</html>";

    printWindow.document.open();

    printWindow.document.write(
        printableHtml
    );

    printWindow.document.close();

    setTimeout(function() {
        printWindow.focus();
        printWindow.print();
    }, 500);
}


function printField(label, value) {
    return (
        "<div class='item'>" +

            "<label>" +
                escapeHtml(label) +
            "</label>" +

            "<strong>" +
                escapeHtml(
                    firstValue(value, "—")
                ) +
            "</strong>" +

        "</div>"
    );
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

const NOTIFICATION_KEY =
    "egc_agency_notifications";


function getNotifications() {
    try {
        const stored =
            localStorage.getItem(
                NOTIFICATION_KEY
            );

        if (!stored) {
            return [];
        }

        const data =
            JSON.parse(stored);

        return Array.isArray(data)
            ? data
            : [];

    } catch (error) {
        return [];
    }
}


function saveNotifications(items) {
    try {
        localStorage.setItem(
            NOTIFICATION_KEY,
            JSON.stringify(items || [])
        );

    } catch (error) {
        console.error(
            "Notification save error:",
            error
        );
    }
}


function loadNotifications() {
    const notifications =
        getNotifications();

    const count =
        notifications.length;

    const notificationCount =
        document.getElementById(
            "notificationCount"
        );

    const sidebarNotificationCount =
        document.getElementById(
            "sidebarNotificationCount"
        );

    const list =
        document.getElementById(
            "notificationList"
        );

    if (notificationCount) {
        notificationCount.textContent =
            count;
    }

    if (sidebarNotificationCount) {
        sidebarNotificationCount.textContent =
            count;
    }

    if (!list) {
        return;
    }

    if (!notifications.length) {
        list.innerHTML =
            "<div class='notification-empty'>" +
                "No notifications." +
            "</div>";

        return;
    }

    list.innerHTML =
        notifications
            .slice()
            .reverse()
            .map(function(item) {

                return (
                    "<div class='notification-item'>" +

                        "<strong>" +
                            escapeHtml(
                                firstValue(
                                    item.title,
                                    "Notification"
                                )
                            ) +
                        "</strong>" +

                        "<p>" +
                            escapeHtml(
                                firstValue(
                                    item.message,
                                    ""
                                )
                            ) +
                        "</p>" +

                    "</div>"
                );

            })
            .join("");
}


function clearNotifications() {
    saveNotifications([]);

    loadNotifications();

    showToast(
        "Notifications cleared.",
        "success"
    );
}


/* =========================================================
   LOGOUT
   ========================================================= */

function openLogoutModal() {
    const modal =
        document.getElementById(
            "logoutModal"
        );

    if (modal) {
        modal.classList.add("show");
    }
}


function closeLogoutModal() {
    const modal =
        document.getElementById(
            "logoutModal"
        );

    if (modal) {
        modal.classList.remove("show");
    }
}


async function confirmLogout() {
    try {
        const {
            error
        } =
            await supabaseClient.auth.signOut();

        if (error) {
            console.error(
                "Logout error:",
                error
            );

            showToast(
                "Logout failed.",
                "error"
            );

            return;
        }

        window.location.href =
            "agency-login.html";

    } catch (error) {
        console.error(
            "Logout exception:",
            error
        );

        showToast(
            "Logout failed.",
            "error"
        );
    }
}


/* =========================================================
   MOBILE MENU
   ========================================================= */

function openMobileMenu() {
    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );

    if (sidebar) {
        sidebar.classList.add("open");
    }

    if (overlay) {
        overlay.classList.add("show");
    }
}


function closeMobileMenu() {
    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );

    if (sidebar) {
        sidebar.classList.remove("open");
    }

    if (overlay) {
        overlay.classList.remove("show");
    }
}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

    const refreshBtn =
        document.getElementById(
            "refreshBtn"
        );

    if (refreshBtn) {
        refreshBtn.addEventListener(
            "click",
            async function() {

                refreshBtn.disabled = true;
                refreshBtn.textContent =
                    "↻  Loading...";

                await loadSlips();

                refreshBtn.disabled = false;
                refreshBtn.textContent =
                    "↻  Refresh";

                showToast(
                    "Slips refreshed.",
                    "success"
                );
            }
        );
    }


    const searchInput =
        document.getElementById(
            "searchInput"
        );

    if (searchInput) {
        searchInput.addEventListener(
            "input",
            applyFilters
        );
    }


    const typeFilter =
        document.getElementById(
            "typeFilter"
        );

    if (typeFilter) {
        typeFilter.addEventListener(
            "change",
            applyFilters
        );
    }


    const statusFilter =
        document.getElementById(
            "statusFilter"
        );

    if (statusFilter) {
        statusFilter.addEventListener(
            "change",
            applyFilters
        );
    }


    const closeSlipModalBtn =
        document.getElementById(
            "closeSlipModal"
        );

    if (closeSlipModalBtn) {
        closeSlipModalBtn.addEventListener(
            "click",
            closeSlipModal
        );
    }


    const cancelSlipModal =
        document.getElementById(
            "cancelSlipModal"
        );

    if (cancelSlipModal) {
        cancelSlipModal.addEventListener(
            "click",
            closeSlipModal
        );
    }


    const printSlipBtn =
        document.getElementById(
            "printSlipBtn"
        );

    if (printSlipBtn) {
        printSlipBtn.addEventListener(
            "click",
            printSelectedSlip
        );
    }


    const slipModal =
        document.getElementById(
            "slipModal"
        );

    if (slipModal) {
        slipModal.addEventListener(
            "click",
            function(event) {

                if (
                    event.target ===
                    this
                ) {
                    closeSlipModal();
                }
            }
        );
    }


    const notificationBtn =
        document.getElementById(
            "notificationBtn"
        );

    if (notificationBtn) {
        notificationBtn.addEventListener(
            "click",
            function(event) {

                event.stopPropagation();

                const panel =
                    document.getElementById(
                        "notificationPanel"
                    );

                if (panel) {
                    panel.classList.toggle(
                        "show"
                    );
                }
            }
        );
    }


    const clearNotificationsBtn =
        document.getElementById(
            "clearNotifications"
        );

    if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener(
            "click",
            clearNotifications
        );
    }


    const logoutBtn =
        document.getElementById(
            "logoutBtn"
        );

    if (logoutBtn) {
        logoutBtn.addEventListener(
            "click",
            openLogoutModal
        );
    }


    const cancelLogout =
        document.getElementById(
            "cancelLogout"
        );

    if (cancelLogout) {
        cancelLogout.addEventListener(
            "click",
            closeLogoutModal
        );
    }


    const confirmLogoutBtn =
        document.getElementById(
            "confirmLogout"
        );

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener(
            "click",
            confirmLogout
        );
    }


    const logoutModal =
        document.getElementById(
            "logoutModal"
        );

    if (logoutModal) {
        logoutModal.addEventListener(
            "click",
            function(event) {

                if (
                    event.target ===
                    this
                ) {
                    closeLogoutModal();
                }
            }
        );
    }


    const menuBtn =
        document.getElementById(
            "menuBtn"
        );

    if (menuBtn) {
        menuBtn.addEventListener(
            "click",
            openMobileMenu
        );
    }


    const sidebarOverlay =
        document.getElementById(
            "sidebarOverlay"
        );

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener(
            "click",
            closeMobileMenu
        );
    }


    document
        .querySelectorAll(".sidebar-link")
        .forEach(function(link) {

            link.addEventListener(
                "click",
                function() {

                    if (
                        window.innerWidth <= 800
                    ) {
                        closeMobileMenu();
                    }
                }
            );
        });


    document.addEventListener(
        "click",
        function(event) {

            const panel =
                document.getElementById(
                    "notificationPanel"
                );

            const button =
                document.getElementById(
                    "notificationBtn"
                );

            if (
                panel &&
                button &&
                panel.classList.contains("show") &&
                !panel.contains(event.target) &&
                !button.contains(event.target)
            ) {
                panel.classList.remove(
                    "show"
                );
            }
        }
    );
}


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializePage() {

    setupEventListeners();

    const success =
        await loadAgency();

    if (!success) {
        return;
    }

    loadNotifications();

    await loadSlips();
}


initializePage();