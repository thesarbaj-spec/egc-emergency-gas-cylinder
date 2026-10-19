"use strict";

/* =========================================================
   EGC AGENCY SLIPS
   One slip per unique cylinder request
   Supabase + Customer Profiles + Payments + Print
   ========================================================= */

const SUPABASE_URL =
    "https://szefvmvokkhvnzryodqu.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_S8aSsfmOKN6_7laRfgoMKA_Re2HzRS6";

const NOTIFICATION_KEY = "egc_agency_notifications";

const $ = id => document.getElementById(id);

if (!window.supabase) {
    const empty = $("emptyState");

    if (empty) {
        empty.style.display = "block";
        empty.textContent =
            "Supabase library load nahi hui. Internet check karke refresh karein.";
    }

    throw new Error("Supabase library unavailable");
}

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "egc-agency-auth",
            storage: window.localStorage
        }
    }
);

/* =========================================================
   GLOBAL DATA
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let currentAgency = null;
let agencyId = null;

let requestRecords = [];
let paymentRecords = [];
let profileMap = {};

let allSlips = [];
let filteredSlips = [];
let selectedSlip = null;

let pageInitialized = false;
let loadingSlips = false;
let signingOut = false;

/* =========================================================
   HELPERS
   ========================================================= */

function firstValue(...values) {
    for (const value of values) {
        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) {
            return value;
        }
    }

    return "";
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function normalizedIdentifier(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeStatus(value) {
    return String(firstValue(value, "pending"))
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function statusText(value) {
    return normalizeStatus(value)
        .replace(/_/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function statusClass(value) {
    const status = normalizeStatus(value);

    if ([
        "approved",
        "accepted",
        "verified",
        "eligible",
        "cleared",
        "active"
    ].includes(status)) {
        return "status-approved";
    }

    if ([
        "paid",
        "success",
        "successful"
    ].includes(status)) {
        return "status-paid";
    }

    if ([
        "completed",
        "delivered"
    ].includes(status)) {
        return "status-completed";
    }

    if ([
        "rejected",
        "reject",
        "failed",
        "cancelled",
        "canceled"
    ].includes(status)) {
        return "status-rejected";
    }

    if ([
        "processing",
        "assigned",
        "ready",
        "out_for_delivery"
    ].includes(status)) {
        return "status-processing";
    }

    if ([
        "pending",
        "pending_approval",
        "waiting",
        "on_hold",
        "hold",
        "submitted",
        "under_review",
        "pending_verification"
    ].includes(status)) {
        return "status-pending";
    }

    return "status-default";
}

function formatMoney(value) {
    const amount = Number(value);

    return "₹" + (
        Number.isFinite(amount) ? amount : 0
    ).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getTimestamp(value) {
    if (!value) return 0;

    const timestamp = new Date(value).getTime();

    return Number.isFinite(timestamp) ? timestamp : 0;
}

function showToast(message, type = "") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message || "";
    toast.className = "toast show";

    if (type) {
        toast.classList.add(type);
    }

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.className = "toast";
    }, 3500);
}

/* =========================================================
   CUSTOMER PROFILE MAPPING

   cylinder_requests.user_id = profiles.id
   ========================================================= */

function getRequestUserId(request) {
    return String(firstValue(
        request?.user_id,
        request?.customer_id,
        request?.profile_id,
        request?.created_by,
        ""
    )).trim();
}

function getCustomerProfile(request) {
    const userId = getRequestUserId(request);

    return userId ? profileMap[userId] || null : null;
}

function getCustomerName(request) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        request?.customer_name,
        request?.full_name,
        profile?.full_name,
        profile?.customer_name,
        profile?.name,
        profile?.display_name,
        profile?.email,
        "Customer"
    ));
}

function getCustomerEGCCode(request) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        request?.egc_user_code,
        request?.egc_user_id,
        profile?.user_code,
        profile?.egc_user_code,
        profile?.egc_user_id,
        profile?.egc_id,
        "Not assigned"
    ));
}

function getCustomerMobile(request) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        request?.customer_mobile,
        request?.mobile,
        request?.mobile_number,
        request?.phone,
        profile?.mobile,
        profile?.mobile_number,
        profile?.phone,
        "—"
    ));
}

function getCustomerEmail(request) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        request?.customer_email,
        request?.email,
        profile?.email,
        profile?.auth_email,
        "—"
    ));
}

/* =========================================================
   REQUEST HELPERS
   ========================================================= */

function getRequestNumber(request) {
    return String(firstValue(
        request?.request_number,
        request?.request_no,
        request?.request_id_number,
        request?.request_code,
        request?.reference_number,
        request?.reference_no,
        request?.id,
        "—"
    ));
}

/*
   Stable slip number:
   same request always gets the same slip number.
   No random number is generated on page refresh.
*/

function getRequestSlipNumber(request) {
    const existing = firstValue(
        request?.request_slip_number,
        request?.request_slip_no,
        request?.slip_number,
        request?.slip_no
    );

    if (existing) return String(existing);

    const requestNumber = getRequestNumber(request);

    if (requestNumber !== "—") {
        return "REQ-SLIP-" + requestNumber;
    }

    return "REQ-SLIP-" +
        String(request?.id || "UNKNOWN")
            .slice(0, 8)
            .toUpperCase();
}

function getRequestDate(request) {
    return firstValue(
        request?.request_date,
        request?.created_at,
        request?.requested_at,
        request?.updated_at,
        ""
    );
}

function getRequestStatus(request) {
    return firstValue(
        request?.owner_approval,
        request?.request_approval,
        request?.approval_status,
        request?.user_status,
        request?.status,
        request?.request_status,
        "pending"
    );
}

function getAgencyStatus(request) {
    return firstValue(request?.agency_status, "waiting");
}

function getDeliveryStatus(request) {
    return firstValue(
        request?.delivery_status,
        request?.delivery_state,
        "pending"
    );
}

function getLPGCompany(request) {
    return firstValue(
        request?.lpg_company,
        request?.company,
        request?.gas_company,
        request?.lpg_provider,
        request?.company_name,
        "—"
    );
}

function getLPGAgencyName(request) {
    return firstValue(
        request?.lpg_agency_name,
        request?.lpg_agency,
        request?.agency_name,
        currentAgency?.agency_name,
        currentAgency?.name,
        currentProfile?.agency_name,
        "—"
    );
}

function getRequestAmount(request) {
    const amount = Number(firstValue(
        request?.total_payable,
        request?.total_amount,
        request?.cylinder_amount,
        request?.amount,
        0
    ));

    return Number.isFinite(amount) ? amount : 0;
}

/* =========================================================
   PAYMENT HELPERS
   ========================================================= */

function getPaymentRequestId(payment) {
    return String(firstValue(
        payment?.request_id,
        payment?.cylinder_request_id,
        payment?.cylinderRequestId,
        payment?.requestId,
        ""
    )).trim();
}

function getPaymentRequestNumber(payment) {
    return String(firstValue(
        payment?.request_number,
        payment?.request_no,
        payment?.cylinder_request_number,
        payment?.cylinder_request_no,
        ""
    )).trim();
}

function getPaymentStatus(payment) {
    return String(firstValue(
        payment?.payment_status,
        payment?.status,
        "pending"
    ));
}

function getPaymentApprovalStatus(payment) {
    return String(firstValue(
        payment?.verification_status,
        payment?.owner_approval,
        payment?.approval_status,
        "pending"
    ));
}

function getPaymentDate(payment) {
    return firstValue(
        payment?.paid_at,
        payment?.payment_date,
        payment?.created_at,
        payment?.submitted_at,
        payment?.updated_at,
        ""
    );
}

function getPaymentAmount(payment) {
    const amount = Number(firstValue(
        payment?.amount,
        payment?.payment_amount,
        payment?.paid_amount,
        payment?.total_amount,
        0
    ));

    return Number.isFinite(amount) ? amount : 0;
}

function getPaymentSlipNumber(payment) {
    const existing = firstValue(
        payment?.payment_slip_number,
        payment?.payment_slip_no,
        payment?.slip_number,
        payment?.slip_no,
        payment?.payment_number
    );

    if (existing) {
        return String(existing).startsWith("PAY-SLIP-")
            ? String(existing)
            : "PAY-SLIP-" + existing;
    }

    const reference = firstValue(
        payment?.transaction_id,
        payment?.payment_transaction_id,
        payment?.id,
        "UNKNOWN"
    );

    return "PAY-SLIP-" +
        String(reference).slice(0, 8).toUpperCase();
}

/*
   Same approval condition used by agency-cylinder-requests.js.
*/

function isPaymentApproved(payment) {
    if (!payment) return false;

    const status = normalizeStatus(getPaymentStatus(payment));

    const approval = normalizeStatus(
        getPaymentApprovalStatus(payment)
    );

    return (
        ["paid", "completed"].includes(status) &&
        ["approved", "verified"].includes(approval)
    );
}

/*
   A payment is linked by request ID first.
   Request number is only a fallback.
*/

function findRequestForPayment(payment, requests) {
    const paymentRequestId = normalizedIdentifier(
        getPaymentRequestId(payment)
    );

    if (paymentRequestId) {
        const byId = (requests || []).find(request =>
            normalizedIdentifier(request.id) === paymentRequestId
        );

        if (byId) return byId;
    }

    const paymentRequestNumber = normalizedIdentifier(
        getPaymentRequestNumber(payment)
    );

    if (paymentRequestNumber) {
        return (requests || []).find(request =>
            normalizedIdentifier(getRequestNumber(request)) ===
            paymentRequestNumber
        ) || null;
    }

    return null;
}

function getPaymentsForRequest(request) {
    const requestId = normalizedIdentifier(request?.id);
    const requestNumber = normalizedIdentifier(
        getRequestNumber(request)
    );

    return paymentRecords.filter(payment => {
        const paymentRequestId = normalizedIdentifier(
            getPaymentRequestId(payment)
        );

        if (paymentRequestId && requestId) {
            return paymentRequestId === requestId;
        }

        const paymentRequestNumber = normalizedIdentifier(
            getPaymentRequestNumber(payment)
        );

        return Boolean(
            requestNumber &&
            paymentRequestNumber &&
            requestNumber === paymentRequestNumber
        );
    }).sort((a, b) =>
        getTimestamp(getPaymentDate(b)) -
        getTimestamp(getPaymentDate(a))
    );
}

/* =========================================================
   AUTHENTICATION AND AGENCY
   ========================================================= */

async function loadAgency() {
    const {
        data: userData,
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !userData?.user) {
        window.location.replace("agency-login.html");
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

    if (profileError || !profile) {
        console.error("Agency profile error:", profileError);

        showToast(
            "Agency profile load nahi hua.",
            "error"
        );

        return false;
    }

    currentProfile = profile;

    if (
        String(profile.role || "").trim().toLowerCase() !== "agency"
    ) {
        showToast(
            "Access denied: account agency role se linked nahi hai.",
            "error"
        );

        return false;
    }

    agencyId = firstValue(
        profile.agency_id,
        profile.agencyId
    );

    if (!agencyId) {
        showToast(
            "Is account ka agency_id set nahi hai.",
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

    if (agencyError) {
        console.warn("Agency information:", agencyError);
    }

    currentAgency = agency || {
        id: agencyId,
        name: firstValue(
            profile.agency_name,
            profile.name,
            "LPG Agency"
        )
    };

    const headerName = $("headerAgencyName");

    if (headerName) {
        headerName.textContent = firstValue(
            currentAgency.agency_name,
            currentAgency.name,
            profile.agency_name,
            "LPG Agency"
        );
    }

    return true;
}

/* =========================================================
   LOAD ASSIGNED REQUESTS
   ========================================================= */

async function loadRequests() {
    if (!agencyId) return [];

    const {
        data,
        error
    } = await supabaseClient
        .from("cylinder_requests")
        .select("*")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Agency requests query failed:", error);
        throw new Error(
            "Requests load nahi hui: " + error.message
        );
    }

    return data || [];
}

/* =========================================================
   LOAD CUSTOMER PROFILES

   Important:
   Fetch only the profiles belonging to these requests.
   ========================================================= */

async function loadCustomerProfiles(requests) {
    const ids = [
        ...new Set(
            (requests || [])
                .map(getRequestUserId)
                .filter(Boolean)
        )
    ];

    if (!ids.length) return [];

    const profiles = [];
    const batchSize = 100;

    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        const {
            data,
            error
        } = await supabaseClient
            .from("profiles")
            .select("*")
            .in("id", batch);

        if (error) {
            console.error(
                "Customer profiles query failed:",
                error
            );

            throw new Error(
                "Customer profiles load nahi hui: " +
                error.message
            );
        }

        profiles.push(...(data || []));
    }

    return profiles;
}

function createProfileMap(profiles) {
    const map = Object.create(null);

    (profiles || []).forEach(profile => {
        if (profile?.id) {
            map[String(profile.id)] = profile;
        }
    });

    return map;
}

/* =========================================================
   LOAD PAYMENTS

   First load agency-assigned requests.
   Then query payments only for those request IDs.

   This matches agency-cylinder-requests.js and avoids
   fetching payments for unrelated requests.
   ========================================================= */

async function loadPayments(requests) {
    const requestIds = [
        ...new Set(
            (requests || [])
                .map(request => String(request.id || "").trim())
                .filter(Boolean)
        )
    ];

    if (!requestIds.length) return [];

    const result = [];
    const batchSize = 100;

    for (let i = 0; i < requestIds.length; i += batchSize) {
        const batch = requestIds.slice(i, i + batchSize);

        const {
            data,
            error
        } = await supabaseClient
            .from("payments")
            .select("*")
            .in("request_id", batch)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Payments query failed:", error);

            throw new Error(
                "Payments load nahi hui: " + error.message
            );
        }

        result.push(...(data || []));
    }

    /*
       Keep only payments that actually belong to one of
       this agency's assigned requests.
    */

    const assignedRequestIds = new Set(
        requestIds.map(normalizedIdentifier)
    );

    return result.filter(payment => {
        const paymentRequestId = normalizedIdentifier(
            getPaymentRequestId(payment)
        );

        if (paymentRequestId) {
            return assignedRequestIds.has(paymentRequestId);
        }

        /*
           Some legacy payment rows may have request_number
           instead of request_id. Match exact request number.
        */

        const matchedRequest = findRequestForPayment(
            payment,
            requests
        );

        return Boolean(matchedRequest);
    });
}

/* =========================================================
   REQUEST ELIGIBILITY

   A slip is shown only if:
   1. Owner approved the request.
   2. There is a linked payment marked paid/completed.
   3. Payment approval is approved/verified.

   Agency status "waiting" alone does not hide an
   owner-approved, payment-approved request.
   ========================================================= */

function isOwnerApproved(request) {
    const status = normalizeStatus(
        request?.owner_approval
    );

    return status === "approved";
}

function hasApprovedPayment(request) {
    return getPaymentsForRequest(request).some(
        isPaymentApproved
    );
}

function isSlipEligible(request) {
    return Boolean(
        request &&
        request.id &&
        isOwnerApproved(request) &&
        hasApprovedPayment(request)
    );
}

/* =========================================================
   BUILD ONE SLIP PER REQUEST
   ========================================================= */

function buildCustomerSlips(requests) {
    const uniqueRequests = new Map();

    (requests || []).forEach(request => {
        if (!request?.id) return;

        const key = normalizedIdentifier(request.id);

        if (!uniqueRequests.has(key)) {
            uniqueRequests.set(key, request);
        }
    });

    const slips = [];

    uniqueRequests.forEach(request => {
        const linkedPayments = getPaymentsForRequest(request);

        const approvedPayments = linkedPayments.filter(
            isPaymentApproved
        );

        /*
           Keep only owner-approved requests with at least
           one approved payment, matching the main agency
           requests page's payment-approval gate.
        */

        if (
            !isOwnerApproved(request) ||
            !approvedPayments.length
        ) {
            return;
        }

        const latestPayment = approvedPayments[0];

        const totalApprovedPaymentAmount =
            approvedPayments.reduce((total, payment) => {
                return total + getPaymentAmount(payment);
            }, 0);

        slips.push({
            id: String(request.id),
            type: "request",
            slipNumber: getRequestSlipNumber(request),
            requestNumber: getRequestNumber(request),
            customerName: getCustomerName(request),
            customerCode: getCustomerEGCCode(request),
            customerMobile: getCustomerMobile(request),
            customerEmail: getCustomerEmail(request),
            amount: totalApprovedPaymentAmount,
            status: getRequestStatus(request),
            agencyStatus: getAgencyStatus(request),
            deliveryStatus: getDeliveryStatus(request),
            date: getRequestDate(request),
            raw: request,
            payments: linkedPayments,
            approvedPayments,
            latestPayment,
            paymentCount: linkedPayments.length
        });
    });

    slips.sort((a, b) =>
        getTimestamp(b.date) - getTimestamp(a.date)
    );

    return slips;
}

/* =========================================================
   LOAD SLIPS
   ========================================================= */

async function loadSlips() {
    if (loadingSlips) return;

    loadingSlips = true;

    const loading = $("loadingState");
    const empty = $("emptyState");
    const table = $("tableWrap");

    if (loading) loading.style.display = "block";
    if (empty) empty.style.display = "none";
    if (table) table.style.display = "none";

    try {
        if (!agencyId) {
            throw new Error("Agency ID available nahi hai.");
        }

        requestRecords = await loadRequests();

        if (!requestRecords.length) {
            paymentRecords = [];
            profileMap = Object.create(null);
            allSlips = [];

            updateStats();
            updatePendingCount([], []);
            applyFilters();

            return;
        }

        const [profiles, payments] = await Promise.all([
            loadCustomerProfiles(requestRecords),
            loadPayments(requestRecords)
        ]);

        profileMap = createProfileMap(profiles);
        paymentRecords = payments || [];

        allSlips = buildCustomerSlips(requestRecords);

        updateStats();
        updatePendingCount(requestRecords, paymentRecords);
        applyFilters();

        console.info("[EGC] Agency ID:", agencyId);
        console.info("[EGC] Assigned requests:", requestRecords.length);
        console.info("[EGC] Customer profiles:", profiles.length);
        console.info("[EGC] Payments loaded:", paymentRecords.length);
        console.info("[EGC] Eligible slips:", allSlips.length);

        console.table(allSlips.map(slip => ({
            request_number: slip.requestNumber,
            slip_number: slip.slipNumber,
            customer: slip.customerName,
            egc_user_id: slip.customerCode,
            mobile: slip.customerMobile,
            email: slip.customerEmail,
            payment_count: slip.paymentCount,
            approved_payment_count: slip.approvedPayments.length
        })));

    } catch (error) {
        console.error("Unable to load slips:", error);

        if (loading) loading.style.display = "none";
        if (table) table.style.display = "none";

        if (empty) {
            empty.style.display = "block";
            empty.innerHTML =
                "<div class='empty-icon'>⚠️</div>" +
                "<strong>Unable to load slips</strong>" +
                "<p style='margin-top:5px;'>" +
                escapeHtml(error.message || "Please refresh the page.") +
                "</p>";
        }

        showToast(
            error.message || "Unable to load slips.",
            "error"
        );

    } finally {
        loadingSlips = false;
    }
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStats() {
    const totalSlips = $("totalSlips");
    const requestSlips = $("requestSlips");
    const paymentSlips = $("paymentSlips");
    const totalAmount = $("totalAmount");

    const requestCount = allSlips.length;

    const withPayments = allSlips.filter(
        slip => slip.approvedPayments.length > 0
    ).length;

    const paidAmount = allSlips.reduce((total, slip) => {
        return total + slip.amount;
    }, 0);

    if (totalSlips) totalSlips.textContent = requestCount;
    if (requestSlips) requestSlips.textContent = requestCount;
    if (paymentSlips) paymentSlips.textContent = withPayments;
    if (totalAmount) totalAmount.textContent = formatMoney(paidAmount);
}

function updatePendingCount(requests, payments) {
    const pendingStatuses = [
        "pending",
        "pending_approval",
        "waiting",
        "on_hold",
        "hold",
        "submitted",
        "under_review",
        "pending_verification"
    ];

    const pendingRequests = (requests || []).filter(request => {
        return pendingStatuses.includes(
            normalizeStatus(getRequestStatus(request))
        );
    }).length;

    const pendingPayments = (payments || []).filter(payment => {
        return pendingStatuses.includes(
            normalizeStatus(getPaymentStatus(payment))
        ) || pendingStatuses.includes(
            normalizeStatus(getPaymentApprovalStatus(payment))
        );
    }).length;

    const count = $("pendingNavCount");

    if (count) {
        count.textContent = pendingRequests + pendingPayments;
    }
}

/* =========================================================
   SEARCH + FILTERS
   ========================================================= */

function applyFilters() {
    const search = String(
        $("searchInput")?.value || ""
    ).trim().toLowerCase();

    const type = $("typeFilter")?.value || "all";
    const status = $("statusFilter")?.value || "all";

    filteredSlips = allSlips.filter(slip => {
        if (
            type === "payment" &&
            !slip.approvedPayments.length
        ) {
            return false;
        }

        if (type === "request" && !slip.id) {
            return false;
        }

        if (status !== "all") {
            const wanted = normalizeStatus(status);

            const requestMatches =
                normalizeStatus(slip.status) === wanted;

            const agencyMatches =
                normalizeStatus(slip.agencyStatus) === wanted;

            const deliveryMatches =
                normalizeStatus(slip.deliveryStatus) === wanted;

            const paymentMatches =
                slip.approvedPayments.some(payment =>
                    normalizeStatus(getPaymentStatus(payment)) === wanted ||
                    normalizeStatus(getPaymentApprovalStatus(payment)) === wanted
                );

            if (
                !requestMatches &&
                !agencyMatches &&
                !deliveryMatches &&
                !paymentMatches
            ) {
                return false;
            }
        }

        if (search) {
            const searchableValues = [
                slip.slipNumber,
                slip.requestNumber,
                slip.customerName,
                slip.customerCode,
                slip.customerMobile,
                slip.customerEmail,
                slip.status,
                slip.agencyStatus,
                slip.deliveryStatus,
                ...slip.payments.map(getPaymentSlipNumber),
                ...slip.payments.map(getPaymentStatus)
            ];

            const searchable = searchableValues
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            if (!searchable.includes(search)) {
                return false;
            }
        }

        return true;
    });

    renderSlips();
}

/* =========================================================
   TABLE RENDER
   ========================================================= */

/* =========================================================
   TABLE RENDER — CUSTOMER SLIPS
   Correct columns:
   Slip No. | Customer | Phone / Email | Request No.
   | Status | Date | Action
   ========================================================= */

function renderSlips() {
    const loading = $("loadingState");
    const empty = $("emptyState");
    const table = $("tableWrap");
    const body = $("slipsBody");

    if (loading) loading.style.display = "none";

    if (!body || !table || !empty) return;

    if (!filteredSlips.length) {
        table.style.display = "none";
        empty.style.display = "block";

        empty.innerHTML =
            "<div class='empty-icon'>📄</div>" +
            "<strong>No approved slips found</strong>" +
            "<p style='margin-top:5px;'>" +
            (
                requestRecords.length
                    ? "Owner approval aur payment approval check karein. Search ya filters bhi check karein."
                    : "Is agency ko koi request assign nahi hui."
            ) +
            "</p>";

        body.innerHTML = "";
        return;
    }

    empty.style.display = "none";
    table.style.display = "block";

    body.innerHTML = filteredSlips.map(slip => {
        const latestPayment = slip.latestPayment;

        const isPaid = (slip.approvedPayments || []).length > 0;

        const rowStatus = isPaid
            ? "Paid"
            : firstValue(slip.status, "Pending");

        const customerName = firstValue(
            slip.customerName,
            "Customer"
        );

        const customerCode = firstValue(
            slip.customerCode,
            "Not assigned"
        );

        const customerMobile = firstValue(
            slip.customerMobile,
            "—"
        );

        const customerEmail = firstValue(
            slip.customerEmail,
            "—"
        );

        const paymentDate = latestPayment
            ? getPaymentDate(latestPayment)
            : slip.date;

        return `
            <tr data-request-row="${escapeHtml(slip.id)}">

                <!-- SLIP NUMBER -->
                <td>
                    <span class="slip-number">
                        ${escapeHtml(slip.slipNumber)}
                    </span>
                </td>

                <!-- CUSTOMER NAME + EGC USER ID -->
                <td>
                    <div class="customer-name">
                        ${escapeHtml(customerName)}
                    </div>

                    <div class="sub-text customer-code">
                        ${escapeHtml(customerCode)}
                    </div>
                </td>

                <!-- PHONE + EMAIL -->
                <td>
                    <div class="customer-phone">
                        ${escapeHtml(customerMobile)}
                    </div>

                    <div class="sub-text customer-email">
                        ${escapeHtml(customerEmail)}
                    </div>
                </td>

                <!-- REQUEST NUMBER -->
                <td>
                    <span class="request-number">
                        ${escapeHtml(slip.requestNumber)}
                    </span>
                </td>

                <!-- PAYMENT STATUS -->
                <td>
                    <span class="status-badge ${statusClass(rowStatus)}">
                        ${escapeHtml(statusText(rowStatus))}
                    </span>
                </td>

                <!-- DATE -->
                <td>
                    ${escapeHtml(formatDate(paymentDate))}
                </td>

                <!-- ACTION -->
                <td>
                    <button
                        type="button"
                        class="view-btn"
                        data-slip-id="${escapeHtml(slip.id)}">
                        View Slip
                    </button>
                </td>

            </tr>
        `;
    }).join("");

    body.querySelectorAll("[data-slip-id]").forEach(button => {
        button.addEventListener("click", () => {
            const slip = filteredSlips.find(item =>
                String(item.id) === String(button.dataset.slipId)
            );

            if (slip) {
                openSlipModal(slip);
            }
        });
    });
}
/* =========================================================
   SLIP MODAL
   ========================================================= */

function field(label, value) {
    return `
        <div class="slip-field">
            <label>${escapeHtml(label)}</label>
            <strong>${escapeHtml(firstValue(value, "—"))}</strong>
        </div>
    `;
}

function openSlipModal(slip) {
    selectedSlip = slip;

    const modal = $("slipModal");
    const preview = $("slipPreview");
    const title = $("slipModalTitle");

    if (!modal || !preview || !title) {
        showToast("Slip preview elements HTML mein nahi mile.", "error");
        return;
    }

    const request = slip.raw || {};
    const payments = slip.approvedPayments || [];

    const agencyName = firstValue(
        currentAgency?.agency_name,
        currentAgency?.name,
        currentProfile?.agency_name,
        "LPG Agency"
    );

    title.textContent = "Request / Payment Slip";

    const fields = [
        field("Request Slip Number", slip.slipNumber),
        field("Request Number", slip.requestNumber),
        field("Customer Name", slip.customerName),
        field("EGC User ID", slip.customerCode),
        field("Mobile Number", slip.customerMobile),
        field("Email", slip.customerEmail),
        field("State", firstValue(request.state, request.state_name, "—")),
        field("District", firstValue(request.district, request.district_name, "—")),
        field("City", firstValue(request.city, request.city_name, request.lpg_city, "—")),
        field("LPG Company", getLPGCompany(request)),
        field("LPG Agency", getLPGAgencyName(request)),
        field("Owner Approval", statusText(request.owner_approval)),
        field("Agency Status", statusText(getAgencyStatus(request))),
        field("Delivery Status", statusText(getDeliveryStatus(request))),
        field("Request Date", formatDateTime(slip.date)),
        field("Cylinder / Request Amount", formatMoney(getRequestAmount(request))),
        field("Approved Payments Total", formatMoney(
            payments.reduce((total, payment) =>
                total + getPaymentAmount(payment), 0)
        )),
        field("Approved Payment Records", payments.length)
    ];

    const paymentHtml = payments.length
        ? payments.map((payment, index) => `
            <div class="slip-payment-item"
                 style="border:1px solid #e2edf3;border-radius:10px;padding:12px;margin-top:10px;">

                <h4 style="margin:0 0 8px;color:#06477f;">
                    Payment ${index + 1}
                </h4>

                ${field("Payment Slip Number", getPaymentSlipNumber(payment))}
                ${field("Payment Amount", formatMoney(getPaymentAmount(payment)))}
                ${field("Payment Status", statusText(getPaymentStatus(payment)))}
                ${field("Payment Approval", statusText(getPaymentApprovalStatus(payment)))}
                ${field("Payment Date", formatDateTime(getPaymentDate(payment)))}
                ${field("Transaction ID", firstValue(
                    payment.transaction_id,
                    payment.payment_transaction_id,
                    payment.transaction_reference,
                    payment.reference_number,
                    "—"
                ))}

            </div>
        `).join("")
        : "<p>No approved payment records found.</p>";

    preview.innerHTML = `
        <div class="slip-header">
            <div class="slip-brand">
                <img
                    src="assets/EGC - Emergency Gas Cylinder logo.png"
                    alt="EGC"
                    onerror="this.style.display='none'">

                <div>
                    <h4>EGC - Emergency Gas Cylinder</h4>
                    <p>${escapeHtml(agencyName)}</p>
                </div>
            </div>
        </div>

        <div class="slip-content">
            <h3 style="margin:0 0 14px;color:#0871c3;">
                Request Details
            </h3>

            <div class="slip-grid">
                ${fields.join("")}
            </div>

            <h3 style="margin:22px 0 10px;color:#0871c3;">
                Approved Payment Details
            </h3>

            ${paymentHtml}
        </div>

        <div class="slip-footer">
            Generated by EGC Agency Panel •
            ${escapeHtml(formatDateTime(new Date().toISOString()))}
        </div>
    `;

    modal.classList.add("show");
}

function closeSlipModal() {
    $("slipModal")?.classList.remove("show");
    selectedSlip = null;
}

/* =========================================================
   PRINT SLIP
   ========================================================= */

function printField(label, value) {
    return `
        <div class="item">
            <label>${escapeHtml(label)}</label>
            <strong>${escapeHtml(firstValue(value, "—"))}</strong>
        </div>
    `;
}

function printSelectedSlip() {
    if (!selectedSlip) {
        showToast("Pehle slip select karein.", "error");
        return;
    }

    const slip = selectedSlip;
    const request = slip.raw || {};
    const payments = slip.approvedPayments || [];

    const agencyName = firstValue(
        currentAgency?.agency_name,
        currentAgency?.name,
        currentProfile?.agency_name,
        "LPG Agency"
    );

    const printWindow = window.open(
        "",
        "_blank",
        "width=900,height=700"
    );

    if (!printWindow) {
        showToast(
            "Slip print karne ke liye browser pop-ups allow karein.",
            "error"
        );
        return;
    }

    const totalApprovedPayment = payments.reduce(
        (total, payment) =>
            total + getPaymentAmount(payment),
        0
    );

    const requestFields = [
        printField("Request Slip Number", slip.slipNumber),
        printField("Request Number", slip.requestNumber),
        printField("Customer Name", slip.customerName),
        printField("EGC User ID", slip.customerCode),
        printField("Mobile", slip.customerMobile),
        printField("Email", slip.customerEmail),
        printField("State", firstValue(request.state, request.state_name, "—")),
        printField("District", firstValue(request.district, request.district_name, "—")),
        printField("City", firstValue(request.city, request.city_name, request.lpg_city, "—")),
        printField("LPG Company", getLPGCompany(request)),
        printField("LPG Agency", getLPGAgencyName(request)),
        printField("Owner Approval", statusText(request.owner_approval)),
        printField("Agency Status", statusText(getAgencyStatus(request))),
        printField("Delivery Status", statusText(getDeliveryStatus(request))),
        printField("Request Date", formatDateTime(slip.date)),
        printField("Request Amount", formatMoney(getRequestAmount(request))),
        printField("Approved Payments Total", formatMoney(totalApprovedPayment))
    ].join("");

    const paymentFields = payments.length
        ? payments.map((payment, index) => `
            <div class="payment-section">
                <h3>Payment ${index + 1}</h3>

                ${printField("Payment Slip Number", getPaymentSlipNumber(payment))}
                ${printField("Amount", formatMoney(getPaymentAmount(payment)))}
                ${printField("Payment Status", statusText(getPaymentStatus(payment)))}
                ${printField("Payment Approval", statusText(getPaymentApprovalStatus(payment)))}
                ${printField("Date", formatDateTime(getPaymentDate(payment)))}
                ${printField("Transaction ID", firstValue(
                    payment.transaction_id,
                    payment.payment_transaction_id,
                    payment.transaction_reference,
                    payment.reference_number,
                    "—"
                ))}
            </div>
        `).join("")
        : "<p>No approved payment records found.</p>";

    const printableHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1.0">
            <title>${escapeHtml(slip.slipNumber)}</title>

            <style>
                *{box-sizing:border-box}
                body{
                    font-family:Arial,Helvetica,sans-serif;
                    margin:0;
                    padding:25px;
                    color:#17344a;
                    background:#fff
                }
                .sheet{
                    max-width:850px;
                    margin:0 auto;
                    border:1px solid #d8e5ed;
                    border-radius:12px;
                    overflow:hidden
                }
                .head{
                    display:flex;
                    align-items:center;
                    gap:14px;
                    padding:20px;
                    background:#f2f8fc;
                    border-bottom:1px solid #d8e5ed
                }
                .head img{
                    width:58px;
                    height:58px;
                    object-fit:contain
                }
                .head h1{
                    margin:0;
                    font-size:22px;
                    color:#06477f
                }
                .head p{
                    margin:5px 0 0;
                    font-size:12px;
                    color:#6c8294
                }
                .title{
                    padding:18px 20px 8px;
                    font-size:18px;
                    font-weight:800;
                    color:#0871c3
                }
                .grid{
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:10px;
                    padding:12px 20px 20px
                }
                .item{
                    border:1px solid #e2edf3;
                    background:#fafcfd;
                    border-radius:8px;
                    padding:11px;
                    min-width:0
                }
                .item label{
                    display:block;
                    font-size:9px;
                    font-weight:800;
                    text-transform:uppercase;
                    color:#8498a6
                }
                .item strong{
                    display:block;
                    font-size:12px;
                    margin-top:5px;
                    word-break:break-word
                }
                .payment-section{
                    padding:15px 20px;
                    border-top:1px solid #d8e5ed;
                    break-inside:avoid
                }
                .payment-section h3{
                    color:#0871c3;
                    font-size:15px;
                    margin:0 0 10px
                }
                .footer{
                    border-top:1px solid #d8e5ed;
                    padding:14px 20px;
                    text-align:center;
                    font-size:10px;
                    color:#8295a2
                }
                @media(max-width:600px){
                    body{padding:8px}
                    .grid{grid-template-columns:1fr}
                    .head h1{font-size:17px}
                }
                @media print{
                    body{padding:0}
                    .sheet{border:0;border-radius:0}
                }
            </style>
        </head>

        <body>
            <div class="sheet">
                <div class="head">
                    <img
                        src="assets/EGC - Emergency Gas Cylinder logo.png"
                        alt="EGC">

                    <div>
                        <h1>EGC - Emergency Gas Cylinder</h1>
                        <p>${escapeHtml(agencyName)}</p>
                    </div>
                </div>

                <div class="title">Request / Payment Slip</div>

                <div class="grid">
                    ${requestFields}
                </div>

                ${paymentFields}

                <div class="footer">
                    Generated by EGC Agency Panel •
                    ${escapeHtml(formatDateTime(new Date().toISOString()))}
                </div>
            </div>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();

    printWindow.onload = function () {
        printWindow.focus();
        printWindow.print();
    };
}

/* =========================================================
   LOCAL NOTIFICATIONS
   ========================================================= */

function getNotifications() {
    try {
        const stored = localStorage.getItem(NOTIFICATION_KEY);

        if (!stored) return [];

        const data = JSON.parse(stored);

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Notification read error:", error);
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
        console.error("Notification save error:", error);
    }
}

function loadNotifications() {
    const notifications = getNotifications();

    const count = notifications.length;

    const notificationCount = $("notificationCount");
    const sidebarCount = $("sidebarNotificationCount");
    const list = $("notificationList");

    if (notificationCount) {
        notificationCount.textContent = count;
    }

    if (sidebarCount) {
        sidebarCount.textContent = count;
    }

    if (!list) return;

    if (!notifications.length) {
        list.innerHTML =
            "<div class='notification-empty'>No notifications.</div>";
        return;
    }

    list.innerHTML = notifications.slice().reverse().map(item => `
        <div class="notification-item">
            <strong>${escapeHtml(firstValue(item.title, "Notification"))}</strong>
            <p>${escapeHtml(firstValue(item.message, ""))}</p>
        </div>
    `).join("");
}

function clearNotifications() {
    saveNotifications([]);
    loadNotifications();
    showToast("Notifications cleared.", "success");
}

/* =========================================================
   LOGOUT
   ========================================================= */

function openLogoutModal() {
    $("logoutModal")?.classList.add("show");
}

function closeLogoutModal() {
    $("logoutModal")?.classList.remove("show");
}

async function confirmLogout() {
    if (signingOut) return;

    signingOut = true;

    const button = $("confirmLogout");

    if (button) {
        button.disabled = true;
        button.textContent = "Logging out...";
    }

    try {
        const { error } = await supabaseClient.auth.signOut();

        if (error) throw error;

        window.location.replace("agency-login.html");
    } catch (error) {
        console.error("Logout failed:", error);

        signingOut = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Logout";
        }

        showToast(error.message || "Logout failed.", "error");
    }
}

/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

function openMobileMenu() {
    $("sidebar")?.classList.add("open");
    $("sidebarOverlay")?.classList.add("show");
}

function closeMobileMenu() {
    $("sidebar")?.classList.remove("open");
    $("sidebarOverlay")?.classList.remove("show");
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {
    if (pageInitialized) return;

    pageInitialized = true;

    $("refreshBtn")?.addEventListener("click", async event => {
        const button = event.currentTarget;

        button.disabled = true;
        button.textContent = "↻ Loading...";

        try {
            await loadSlips();
            showToast("Slips refreshed.", "success");
        } finally {
            button.disabled = false;
            button.textContent = "↻ Refresh";
        }
    });

    $("searchInput")?.addEventListener("input", applyFilters);
    $("typeFilter")?.addEventListener("change", applyFilters);
    $("statusFilter")?.addEventListener("change", applyFilters);

    $("closeSlipModal")?.addEventListener("click", closeSlipModal);
    $("cancelSlipModal")?.addEventListener("click", closeSlipModal);
    $("printSlipBtn")?.addEventListener("click", printSelectedSlip);

    $("slipModal")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
            closeSlipModal();
        }
    });

    $("notificationBtn")?.addEventListener("click", event => {
        event.stopPropagation();
        $("notificationPanel")?.classList.toggle("show");
    });

    $("notificationPanel")?.addEventListener("click", event => {
        event.stopPropagation();
    });

    $("clearNotifications")?.addEventListener(
        "click",
        clearNotifications
    );

    $("logoutBtn")?.addEventListener("click", openLogoutModal);
    $("cancelLogout")?.addEventListener("click", closeLogoutModal);
    $("confirmLogout")?.addEventListener("click", confirmLogout);

    $("logoutModal")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
            closeLogoutModal();
        }
    });

    $("menuBtn")?.addEventListener("click", openMobileMenu);
    $("sidebarOverlay")?.addEventListener("click", closeMobileMenu);

    document.querySelectorAll(".sidebar-link").forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 800) {
                closeMobileMenu();
            }
        });
    });

    document.addEventListener("click", event => {
        const panel = $("notificationPanel");
        const button = $("notificationBtn");

        if (
            panel &&
            button &&
            panel.classList.contains("show") &&
            !panel.contains(event.target) &&
            !button.contains(event.target)
        ) {
            panel.classList.remove("show");
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        closeSlipModal();
        closeLogoutModal();
        closeMobileMenu();

        $("notificationPanel")?.classList.remove("show");
    });

    supabaseClient.auth.onAuthStateChange(event => {
        if (event === "SIGNED_OUT" && !signingOut) {
            window.location.replace("agency-login.html");
        }
    });
}

/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializePage() {
    setupEventListeners();

    try {
        const authenticated = await loadAgency();

        if (!authenticated) return;

        loadNotifications();

        await loadSlips();
    } catch (error) {
        console.error("Agency slips initialization failed:", error);

        showToast(
            error.message || "Agency Slips initialize nahi hua.",
            "error"
        );
    }
}

initializePage();
