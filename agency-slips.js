"use strict";

/* =========================================================
   EGC AGENCY SLIPS
   Original Customer E-Slip Integration
   Same Original Slip Number + Verification Code
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
let profileMap = Object.create(null);

let allSlips = [];
let filteredSlips = [];
let originalSlipRecords = [];

let selectedSlip = null;

let pageInitialized = false;
let loadingSlips = false;
let signingOut = false;

let slipsRealtimeChannel = null;
let realtimeRefreshTimer = null;
let realtimeReloadPending = false;

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

    if (["paid", "success", "successful"].includes(status)) {
        return "status-paid";
    }

    if (["completed", "delivered"].includes(status)) {
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

    return "status-pending";
}

function formatMoney(value) {
    const amount = Number(value);

    return "₹" + (
        Number.isFinite(amount) ? amount : 0
    ).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
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
   CUSTOMER PROFILE HELPERS
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

function getCustomerName(request, originalSlip = null) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        originalSlip?.user_name,
        request?.customer_name,
        request?.full_name,
        profile?.full_name,
        profile?.customer_name,
        profile?.name,
        profile?.display_name,
        "Customer"
    ));
}

function getCustomerEGCCode(request, originalSlip = null) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        originalSlip?.user_code,
        request?.egc_user_code,
        profile?.user_code,
        profile?.egc_user_code,
        profile?.egc_user_id,
        "Not assigned"
    ));
}

function getCustomerMobile(request, originalSlip = null) {
    const profile = getCustomerProfile(request);

    return String(firstValue(
        originalSlip?.mobile,
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

function getCustomerAddress(request) {
    return String(firstValue(
        request?.address,
        request?.customer_address,
        request?.full_address,
        "—"
    ));
}

/* =========================================================
   REQUEST HELPERS
   ========================================================= */

function getRequestNumber(request, originalSlip = null) {
    return String(firstValue(
        originalSlip?.request_number_snapshot,
        request?.request_number,
        request?.request_no,
        request?.request_code,
        request?.id,
        "—"
    ));
}

function getRequestStatus(request) {
    return firstValue(
        request?.status,
        request?.user_status,
        request?.request_status,
        "pending"
    );
}

function getAgencyStatus(request, originalSlip = null) {
    return firstValue(
        request?.agency_status,
        originalSlip?.slip_status,
        "waiting"
    );
}

function getDeliveryStatus(request, originalSlip = null) {
    return firstValue(
        request?.delivery_status,
        originalSlip?.delivery_status,
        "pending"
    );
}

function getLPGCompany(request, originalSlip = null) {
    return firstValue(
        originalSlip?.lpg_company,
        request?.lpg_company,
        request?.company,
        request?.gas_company,
        "—"
    );
}

function getLPGAgencyName(request, originalSlip = null) {
    return firstValue(
        originalSlip?.agency_name,
        request?.agency_name,
        currentAgency?.agency_name,
        currentAgency?.name,
        currentProfile?.agency_name,
        "—"
    );
}

function getCylinderType(request) {
    return firstValue(
        request?.cylinder_type,
        request?.cylinder_category,
        request?.gas_type,
        request?.product_type,
        "—"
    );
}

function getCylinderWeight(request) {
    const weight = firstValue(
        request?.cylinder_weight,
        request?.weight,
        request?.cylinder_size,
        request?.cylinder_capacity,
        request?.weight_kg,
        ""
    );

    if (!weight) return "—";

    const value = String(weight).trim();

    return /kg/i.test(value) ? value : value + " KG";
}

function getSlipDate(originalSlip) {
    return firstValue(
        originalSlip?.created_at,
        originalSlip?.approved_at,
        ""
    );
}

function getDeliveryDate(request, originalSlip) {
    return firstValue(
        request?.delivery_date,
        request?.delivered_at,
        originalSlip?.delivered_at,
        ""
    );
}

/* =========================================================
   PAYMENT HELPERS
   ========================================================= */

function getPaymentRequestId(payment) {
    return String(firstValue(
        payment?.request_id,
        payment?.cylinder_request_id,
        ""
    )).trim();
}

function getPaymentRequestNumber(payment) {
    return String(firstValue(
        payment?.request_number,
        payment?.request_no,
        payment?.cylinder_request_number,
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
        payment?.payment_date,
        payment?.created_at,
        payment?.verified_at,
        ""
    );
}

function getPaymentAmount(payment) {
    const amount = Number(firstValue(
        payment?.payment_amount,
        payment?.amount,
        payment?.paid_amount,
        0
    ));

    return Number.isFinite(amount) ? amount : 0;
}

function getPaymentType(payment) {
    return statusText(firstValue(
        payment?.payment_type,
        "Payment"
    ));
}

function getPaymentTransactionId(payment, originalSlip = null) {
    return firstValue(
        originalSlip?.transaction_id,
        payment?.transaction_id,
        payment?.payment_reference,
        "—"
    );
}

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

function getPaymentsForRequest(request) {
    const requestId = normalizedIdentifier(request?.id);

    return paymentRecords.filter(payment => {
        const paymentRequestId = normalizedIdentifier(
            getPaymentRequestId(payment)
        );

        return paymentRequestId === requestId;
    }).sort((a, b) =>
        getTimestamp(getPaymentDate(b)) -
        getTimestamp(getPaymentDate(a))
    );
}

/* =========================================================
   ORIGINAL CUSTOMER E-SLIPS
   ========================================================= */

async function loadOriginalRequestSlips(requests) {
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

        const { data, error } = await supabaseClient
            .from("request_slips")
            .select("*")
            .in("request_id", batch)
            .in("slip_type", [
                "standard",
                "historical_recovery"
            ])
            .eq("slip_status", "active");

        if (error) {
            throw new Error(
                "Original Slips load failed: " + error.message
            );
        }

        result.push(...(data || []));
    }

    console.log("Loaded Original Slips:", result);

    return result;
}

function getOriginalSlipForPayment(request, payment) {
    if (!request?.id || !payment?.id) return null;

    return originalSlipRecords.find(slip =>
        String(slip.request_id) === String(request.id) &&
        String(slip.payment_id) === String(payment.id) &&
        normalizeStatus(slip.slip_status) === "active" &&
        ["standard", "historical_recovery"].includes(
            normalizeStatus(slip.slip_type)
        )
    ) || null;
}

/* =========================================================
   PAYMENT / ORIGINAL SLIP MATCHING
   ========================================================= */
function getOriginalSlipForRequest(request, approvedPayments) {
    if (!request?.id) return null;

    const requestSlips = originalSlipRecords.filter(slip =>
        String(slip.request_id) === String(request.id) &&
        normalizeStatus(slip.slip_status) === "active" &&
        [
            "standard",
            "historical_recovery"
        ].includes(normalizeStatus(slip.slip_type))
    );

    for (const originalSlip of requestSlips) {
        const matchedPayment = (approvedPayments || []).find(
            payment =>
                String(payment.id) === String(originalSlip.payment_id) &&
                isPaymentApproved(payment)
        );

        if (matchedPayment) {
            return {
                originalSlip,
                payment: matchedPayment
            };
        }
    }

    console.warn(
        "Original slip matching failed:",
        request.request_number,
        requestSlips,
        approvedPayments
    );

    return null;
}

/* =========================================================
   LATEST ACTIVITY SORTING
   ========================================================= */

function getLatestSlipActivity(request) {
    if (!request) return 0;

    const linkedPayments = getPaymentsForRequest(request);
    const timestamps = [];

    function collect(record) {
        if (!record) return;

        [
            "updated_at",
            "created_at",
            "request_date",
            "payment_date",
            "verified_at",
            "approved_at",
            "delivery_date",
            "delivered_at",
            "agency_updated_at"
        ].forEach(key => {
            const timestamp = getTimestamp(record[key]);

            if (timestamp > 0) {
                timestamps.push(timestamp);
            }
        });
    }

    collect(request);

    linkedPayments.forEach(collect);

    return timestamps.length
        ? Math.max(...timestamps)
        : 0;
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
   LOAD REQUESTS
   ========================================================= */

async function loadRequests() {
    if (!agencyId) return [];

    const { data, error } = await supabaseClient
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

        const { data, error } = await supabaseClient
            .from("profiles")
            .select("*")
            .in("id", batch);

        if (error) {
            console.error("Customer profiles query failed:", error);

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

        const { data, error } = await supabaseClient
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

    const assignedRequestIds = new Set(
        requestIds.map(normalizedIdentifier)
    );

    return result.filter(payment => {
        const paymentRequestId = normalizedIdentifier(
            getPaymentRequestId(payment)
        );

        return assignedRequestIds.has(paymentRequestId);
    });
}

/* =========================================================
   SLIP ELIGIBILITY
   ========================================================= */

function isOwnerApproved(request) {
    return normalizeStatus(request?.owner_approval) === "approved";
}

function isSlipEligible(request) {
    return Boolean(
        request &&
        request.id &&
        isOwnerApproved(request) &&
        getPaymentsForRequest(request).some(isPaymentApproved)
    );
}

/* =========================================================
   BUILD ONE ORIGINAL SLIP PER REQUEST
   ========================================================= */

function buildCustomerSlips(requests) {
    const uniqueRequests = new Map();

    (requests || []).forEach(request => {
        if (!request?.id) return;

        uniqueRequests.set(String(request.id), request);
    });

    const slips = [];

    uniqueRequests.forEach(request => {
        const linkedPayments = getPaymentsForRequest(request);

        const approvedPayments = linkedPayments.filter(
            isPaymentApproved
        );

        if (!isOwnerApproved(request) || !approvedPayments.length) {
            return;
        }

        const matched = getOriginalSlipForRequest(
            request,
            approvedPayments
        );

        const originalSlip = matched?.originalSlip || null;
        const originalPayment = matched?.payment || null;

        slips.push({
            id: String(request.id),

            type: "request",

            slipNumber: originalSlip?.slip_number ||
                "Original Slip Pending",

            verificationCode:
                originalSlip?.verification_code || "",

            requestNumber: getRequestNumber(
                request,
                originalSlip
            ),

            slipDate: originalSlip
                ? getSlipDate(originalSlip)
                : request.created_at,

            customerName: getCustomerName(
                request,
                originalSlip
            ),

            customerCode: getCustomerEGCCode(
                request,
                originalSlip
            ),

            customerMobile: getCustomerMobile(
                request,
                originalSlip
            ),

            customerEmail: getCustomerEmail(request),

            customerAddress: getCustomerAddress(request),

            status: getRequestStatus(request),

            agencyStatus: getAgencyStatus(
                request,
                originalSlip
            ),

            deliveryStatus: getDeliveryStatus(
                request,
                originalSlip
            ),

            date: originalSlip
                ? getSlipDate(originalSlip)
                : request.created_at,

            raw: request,

            originalSlip: originalSlip,

            payments: linkedPayments,

            approvedPayments: approvedPayments,

            latestPayment: originalPayment ||
                approvedPayments[0] ||
                null,

            paymentCount: linkedPayments.length
        });
    });

    slips.sort((a, b) =>
        getLatestSlipActivity(b.raw) -
        getLatestSlipActivity(a.raw)
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
            originalSlipRecords = [];
            profileMap = Object.create(null);
            allSlips = [];

            updateStats();
            updatePendingCount([], []);
            applyFilters();

            return;
        }

        const [
            profiles,
            payments,
            originalSlips
        ] = await Promise.all([
            loadCustomerProfiles(requestRecords),
            loadPayments(requestRecords),
            loadOriginalRequestSlips(requestRecords)
        ]);

        profileMap = createProfileMap(profiles);
        paymentRecords = payments || [];
        originalSlipRecords = originalSlips || [];

        const builtSlips = buildCustomerSlips(requestRecords);

        allSlips = Array.isArray(builtSlips)
            ? builtSlips
            : [];

        console.log("========== EGC AGENCY SLIPS ==========");

        console.table(allSlips.map(slip => ({
            request_number: slip.requestNumber,
            original_slip_number: slip.slipNumber,
            verification_code: slip.verificationCode,
            customer: slip.customerName,
            egc_user_id: slip.customerCode,
            email: slip.customerEmail
        })));

        console.log("Requests:", requestRecords.length);
        console.log("Profiles:", profiles.length);
        console.log("Payments:", paymentRecords.length);
        console.log("Original slips:", originalSlipRecords.length);
        console.log("Agency slips:", allSlips.length);

        updateStats();
        updatePendingCount(requestRecords, paymentRecords);
        applyFilters();

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

        if (realtimeReloadPending) {
            realtimeReloadPending = false;

            setTimeout(() => {
                loadSlips();
            }, 300);
        }
    }
}

/* =========================================================
   REALTIME UPDATE
   ========================================================= */

function scheduleSlipsRealtimeRefresh() {
    clearTimeout(realtimeRefreshTimer);

    realtimeRefreshTimer = setTimeout(() => {
        if (loadingSlips) {
            realtimeReloadPending = true;
            return;
        }

        loadSlips();
    }, 700);
}

function startSlipsRealtime() {
    if (!agencyId) return;

    if (slipsRealtimeChannel) {
        supabaseClient.removeChannel(slipsRealtimeChannel);
        slipsRealtimeChannel = null;
    }

    slipsRealtimeChannel = supabaseClient
        .channel("egc-agency-slips-realtime-" + agencyId)

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "cylinder_requests",
                filter: "agency_id=eq." + String(agencyId)
            },
            payload => {
                console.log(
                    "[EGC Slips] Request activity:",
                    payload.eventType
                );

                scheduleSlipsRealtimeRefresh();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "payments"
            },
            payload => {
                console.log(
                    "[EGC Slips] Payment activity:",
                    payload.eventType
                );

                scheduleSlipsRealtimeRefresh();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "profiles"
            },
            payload => {
                console.log(
                    "[EGC Slips] Customer profile activity:",
                    payload.eventType
                );

                scheduleSlipsRealtimeRefresh();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "request_slips"
            },
            payload => {
                console.log(
                    "[EGC Slips] Original slip activity:",
                    payload.eventType
                );

                scheduleSlipsRealtimeRefresh();
            }
        )

        .subscribe(status => {
            console.log("[EGC Slips] Realtime status:", status);
        });
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStats() {
    const approvedPaymentSlips = $("approvedPaymentSlips");

    const slips = Array.isArray(allSlips)
        ? allSlips
        : [];

    const approvedCount = slips.length;

    if (approvedPaymentSlips) {
        approvedPaymentSlips.textContent = approvedCount;
    }
}

function updatePendingCount(requests = [], payments = []) {
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

    const pendingRequests = requests.filter(request =>
        pendingStatuses.includes(
            normalizeStatus(request.owner_approval)
        )
    ).length;

    const pendingPayments = payments.filter(payment =>
        pendingStatuses.includes(
            normalizeStatus(getPaymentStatus(payment))
        ) ||
        pendingStatuses.includes(
            normalizeStatus(getPaymentApprovalStatus(payment))
        )
    ).length;

    const pendingCount = $("pendingSlips");

    if (pendingCount) {
        pendingCount.textContent =
            pendingRequests + pendingPayments;
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

    const safeSlips = Array.isArray(allSlips)
        ? allSlips
        : [];

    const sortedSlips = [...safeSlips].sort((a, b) =>
        getLatestSlipActivity(b.raw) -
        getLatestSlipActivity(a.raw)
    );

    filteredSlips = sortedSlips.filter(slip => {
        const approvedPayments = slip.approvedPayments || [];
        const payments = slip.payments || [];

        if (
            type === "payment" &&
            approvedPayments.length === 0
        ) {
            return false;
        }

        if (status !== "all") {
            const wanted = normalizeStatus(status);

            const matches =
                normalizeStatus(slip.status) === wanted ||
                normalizeStatus(slip.agencyStatus) === wanted ||
                normalizeStatus(slip.deliveryStatus) === wanted ||
                approvedPayments.some(payment =>
                    normalizeStatus(getPaymentStatus(payment)) === wanted ||
                    normalizeStatus(getPaymentApprovalStatus(payment)) === wanted
                );

            if (!matches) return false;
        }

        if (search) {
            const searchable = [
                slip.slipNumber,
                slip.verificationCode,
                slip.requestNumber,
                slip.customerName,
                slip.customerCode,
                slip.customerMobile,
                slip.customerEmail,
                slip.status,
                slip.agencyStatus,
                slip.deliveryStatus,
                ...payments.map(getPaymentStatus)
            ].filter(Boolean).join(" ").toLowerCase();

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
            "<strong>No customer slips found</strong>" +
            "<p style='margin-top:5px;'>" +
            (
                requestRecords.length
                    ? "Approved customer requests aur payments check karein."
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

        const paymentDate = latestPayment
            ? getPaymentDate(latestPayment)
            : slip.slipDate;

        return `
            <tr data-request-row="${escapeHtml(slip.id)}">

                <td>
                    <span class="slip-number">
                        ${escapeHtml(slip.slipNumber)}
                    </span>
                </td>

                <td>
                    <div class="customer-name">
                        ${escapeHtml(slip.customerName)}
                    </div>

                    <div class="sub-text customer-code">
                        ${escapeHtml(slip.customerCode)}
                    </div>
                </td>

                <td>
                    <div class="customer-phone">
                        ${escapeHtml(slip.customerMobile)}
                    </div>

                    <div class="sub-text customer-email">
                        ${escapeHtml(slip.customerEmail)}
                    </div>
                </td>

                <td>
                    <span class="request-number">
                        ${escapeHtml(slip.requestNumber)}
                    </span>
                </td>

                <td>
                    <span class="status-badge ${statusClass(
                        slip.originalSlip ? "approved" : "pending"
                    )}">
                        ${slip.originalSlip ? "Approved" : "Slip Pending"}
                    </span>
                </td>

                <td>
                    ${escapeHtml(formatDate(paymentDate))}
                </td>

                <td>
                    ${
                        slip.originalSlip
                            ? `
                                <button
                                    type="button"
                                    class="view-btn"
                                    data-slip-id="${escapeHtml(slip.id)}">
                                    View Slip
                                </button>
                            `
                            : `
                                <button
                                    type="button"
                                    disabled
                                    style="opacity:.5;cursor:not-allowed;">
                                    Slip Pending
                                </button>
                            `
                    }
                </td>

            </tr>
        `;
    }).join("");

    body.querySelectorAll("[data-slip-id]").forEach(button => {
        button.addEventListener("click", () => {
            const slip = filteredSlips.find(item =>
                String(item.id) === String(button.dataset.slipId)
            );

            if (slip && slip.originalSlip) {
                openSlipModal(slip);
            }
        });
    });
}

/* =========================================================
   SLIP FIELD
   ========================================================= */

function field(label, value) {
    return `
        <div class="slip-field">
            <label>${escapeHtml(label)}</label>
            <strong>${escapeHtml(firstValue(value, "—"))}</strong>
        </div>
    `;
}

/* =========================================================
   PAYMENT TABLE
   Amount column renamed to Amount Paid.
   No extra financial summary.
   ========================================================= */

function buildPaymentTable(slip) {
    const payment = slip.latestPayment;

    if (!payment) {
        return `
            <p>No approved payment records found.</p>
        `;
    }

    const originalSlip = slip.originalSlip;

    return `
        <div style="overflow-x:auto;">
            <table style="
                width:100%;
                border-collapse:collapse;
                font-size:13px;
                margin-top:10px;
            ">
                <thead>
                    <tr style="background:#f2f8fc;">
                        <th style="padding:10px;text-align:left;">Payment Type</th>
                        <th style="padding:10px;text-align:left;">Date</th>
                        <th style="padding:10px;text-align:left;">Amount Paid</th>
                        <th style="padding:10px;text-align:left;">Status</th>
                        <th style="padding:10px;text-align:left;">Owner Approval</th>
                    </tr>
                </thead>

                <tbody>
                    <tr>
                        <td style="padding:10px;">
                            ${escapeHtml(getPaymentType(payment))}
                        </td>

                        <td style="padding:10px;">
                            ${escapeHtml(formatDateTime(
                                firstValue(
                                    originalSlip?.payment_date,
                                    getPaymentDate(payment)
                                )
                            ))}
                        </td>

                        <td style="padding:10px;font-weight:700;color:#13834a;">
                            Paid
                        </td>

                        <td style="padding:10px;">
                            <span class="status-badge status-approved">
                                Approved
                            </span>
                        </td>

                        <td style="padding:10px;">
                            <span class="status-badge status-approved">
                                Approved
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

/* =========================================================
   ORIGINAL CUSTOMER E-SLIP CONTENT
   ========================================================= */

function buildOriginalSlipHTML(slip) {
    const request = slip.raw || {};
    const originalSlip = slip.originalSlip || {};
    const payment = slip.latestPayment || {};

    const agencyName = getLPGAgencyName(
        request,
        originalSlip
    );

    const paymentTable = buildPaymentTable(slip);

    const requestStatus = getRequestStatus(request);
    const ownerApproval = request.owner_approval;

    const agencyStatus = getAgencyStatus(
        request,
        originalSlip
    );

    const deliveryStatus = getDeliveryStatus(
        request,
        originalSlip
    );

    const deliveryDate = getDeliveryDate(
        request,
        originalSlip
    );

    return `
        <div class="egc-original-slip">

            <!-- HEADER -->
            <div class="slip-header">
                <div class="slip-brand">

                    <img
                        src="assets/EGC - Emergency Gas Cylinder logo.png"
                        alt="EGC"
                        onerror="this.style.display='none'">

                    <div>
                        <h4>EGC - Emergency Gas Cylinder</h4>
                    </div>

                </div>
            </div>

            <div class="slip-content">

                <!-- PAYMENT VERIFIED -->
                <div style="
                    text-align:center;
                    margin:15px 0 22px;
                ">
                    <h2 style="
                        color:#13834a;
                        margin:0;
                        font-size:21px;
                        font-weight:800;
                    ">
                        PAYMENT VERIFIED
                    </h2>
                </div>

                <!-- CURRENT REQUEST STATUS -->
                <h3 style="color:#0871c3;margin:0 0 12px;">
                    Current Request Status
                </h3>

                <div class="slip-grid">

                    ${field(
                        "Payment Owner Approval",
                        statusText(ownerApproval)
                    )}

                    ${field(
                        "Agency Status",
                        statusText(agencyStatus)
                    )}

                    ${field(
                        "Delivery Status",
                        statusText(deliveryStatus)
                    )}

                    ${field(
                        "Request Status",
                        statusText(requestStatus)
                    )}

                </div>

                <!-- SLIP INFORMATION -->
                <h3 style="color:#0871c3;margin:22px 0 12px;">
                    Slip Information
                </h3>

                <div class="slip-grid">

                    ${field(
                        "Slip Number",
                        originalSlip.slip_number
                    )}

                    ${field(
                        "Request Number",
                        slip.requestNumber
                    )}

                    ${field(
                        "Slip Date",
                        formatDate(slip.slipDate)
                    )}

                    ${field(
                        "Payment Status",
                        "Approved"
                    )}

                </div>

                <!-- CUSTOMER DETAILS -->
                <h3 style="color:#0871c3;margin:22px 0 12px;">
                    Customer Details
                </h3>

                <div class="slip-grid">

                    ${field(
                        "Customer Name",
                        slip.customerName
                    )}

                    ${field(
                        "Mobile Number",
                        slip.customerMobile
                    )}

                    ${field(
                        "EGC User ID",
                        slip.customerCode
                    )}

                    ${field(
                        "Email",
                        slip.customerEmail
                    )}

                    ${field(
                        "Customer Address",
                        slip.customerAddress
                    )}

                </div>

                <!-- LPG & AGENCY DETAILS -->
                <h3 style="color:#0871c3;margin:22px 0 12px;">
                    LPG & Agency Details
                </h3>

                <div class="slip-grid">

                    ${field(
                        "Cylinder Type",
                        getCylinderType(request)
                    )}

                    ${field(
                        "Cylinder Weight",
                        getCylinderWeight(request)
                    )}

                    ${field(
                        "LPG Company",
                        getLPGCompany(request, originalSlip)
                    )}

                    ${field(
                        "Agency Name",
                        agencyName
                    )}

                    ${field(
                        "Cylinder Quantity",
                        firstValue(
                            originalSlip.quantity,
                            request.quantity,
                            1
                        )
                    )}

                    ${field(
                        "Agency Status",
                        statusText(agencyStatus)
                    )}

                    ${field(
                        "Delivery Status",
                        statusText(deliveryStatus)
                    )}

                    ${field(
                        "Delivery Date",
                        formatDate(deliveryDate)
                    )}

                </div>

                <!-- PAYMENT DETAILS -->
                <h3 style="color:#0871c3;margin:22px 0 12px;">
                    Payment & Repayment Details
                </h3>

                ${paymentTable}

                <!-- VERIFICATION -->
                <div style="
                    margin-top:24px;
                    padding:18px;
                    text-align:center;
                    border:1px dashed #b8d1e2;
                    border-radius:10px;
                    background:#f8fbfd;
                ">

                    <h3 style="
                        color:#0871c3;
                        margin:0 0 12px;
                    ">
                        Slip Verification Code
                    </h3>

                    <strong style="
                        font-size:21px;
                        letter-spacing:2px;
                        color:#17344a;
                    ">
                        ${escapeHtml(
                            originalSlip.verification_code || "—"
                        )}
                    </strong>

                    <p style="
                        margin:10px 0 0;
                        color:#718697;
                        font-size:12px;
                    ">
                        Keep this code for your records.
                    </p>

                </div>

            </div>

            <!-- FOOTER -->
            <div class="slip-footer" style="
                text-align:center;
                line-height:1.8;
            ">

                <strong>EGC - Emergency Gas Cylinder</strong>

                <br>

                This is a system-generated E-Slip.

                <br>

                Please keep it safe for future reference.

                <br>

                Last Status Checked:
                ${escapeHtml(formatDateTime(new Date().toISOString()))}

                <br>

                EGC Developed by Sarbaj

            </div>

        </div>
    `;
}

/* =========================================================
   OPEN SLIP MODAL
   ========================================================= */

function openSlipModal(slip) {
    selectedSlip = slip;

    const modal = $("slipModal");
    const preview = $("slipPreview");
    const title = $("slipModalTitle");

    if (!modal || !preview || !title) {
        showToast(
            "Slip preview elements HTML mein nahi mile.",
            "error"
        );

        return;
    }

    if (!slip.originalSlip) {
        showToast(
            "Original Customer E-Slip nahi mili.",
            "error"
        );

        return;
    }

    title.textContent = "Payment Slip";

    preview.innerHTML = buildOriginalSlipHTML(slip);

    modal.classList.add("show");
}

function closeSlipModal() {
    $("slipModal")?.classList.remove("show");
    selectedSlip = null;
}

/* =========================================================
   PRINT / SAVE PDF
   Same Original E-Slip Content
   ========================================================= */

function printSelectedSlip() {
    if (!selectedSlip) {
        showToast("Pehle slip select karein.", "error");
        return;
    }

    if (!selectedSlip.originalSlip) {
        showToast(
            "Original Customer E-Slip nahi mili.",
            "error"
        );

        return;
    }

    const slip = selectedSlip;

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

    const printableHtml = `
        <!DOCTYPE html>
        <html lang="en">

        <head>
            <meta charset="UTF-8">

            <meta
                name="viewport"
                content="width=device-width,initial-scale=1.0">

            <title>
                ${escapeHtml(slip.slipNumber)}
            </title>

            <style>

                * {
                    box-sizing:border-box;
                }

                body {
                    font-family:Arial,Helvetica,sans-serif;
                    margin:0;
                    padding:20px;
                    color:#17344a;
                    background:#fff;
                }

                .egc-original-slip {
                    max-width:850px;
                    margin:0 auto;
                    border:1px solid #d8e5ed;
                    border-radius:12px;
                    overflow:hidden;
                    background:#fff;
                }

                .slip-header {
                    padding:20px;
                    background:#f2f8fc;
                    border-bottom:1px solid #d8e5ed;
                }

                .slip-brand {
                    display:flex;
                    align-items:center;
                    gap:14px;
                }

                .slip-brand img {
                    width:60px;
                    height:60px;
                    object-fit:contain;
                }

                .slip-brand h4 {
                    margin:0;
                    color:#06477f;
                    font-size:20px;
                }

                .slip-content {
                    padding:20px;
                }

                .slip-grid {
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:10px;
                }

                .slip-field {
                    border:1px solid #e2edf3;
                    background:#fafcfd;
                    border-radius:8px;
                    padding:11px;
                    min-width:0;
                }

                .slip-field label {
                    display:block;
                    font-size:9px;
                    font-weight:800;
                    text-transform:uppercase;
                    color:#8498a6;
                }

                .slip-field strong {
                    display:block;
                    font-size:12px;
                    margin-top:5px;
                    word-break:break-word;
                }

                table {
                    width:100%;
                    border-collapse:collapse;
                }

                th, td {
                    border:1px solid #e2edf3;
                    padding:10px;
                    text-align:left;
                    font-size:12px;
                }

                th {
                    background:#f2f8fc;
                    color:#06477f;
                }

                .status-badge {
                    display:inline-block;
                    padding:5px 9px;
                    border-radius:20px;
                    background:#e8f7ee;
                    color:#13834a;
                    font-size:11px;
                    font-weight:700;
                }

                .slip-footer {
                    padding:18px;
                    border-top:1px solid #d8e5ed;
                    font-size:11px;
                    color:#718697;
                }

                @media(max-width:600px) {
                    body {
                        padding:5px;
                    }

                    .slip-grid {
                        grid-template-columns:1fr;
                    }

                    .slip-content {
                        padding:12px;
                    }

                    .slip-brand h4 {
                        font-size:16px;
                    }
                }

                @media print {
                    body {
                        padding:0;
                    }

                    .egc-original-slip {
                        border:0;
                        border-radius:0;
                    }

                    .slip-field,
                    .slip-footer,
                    table,
                    tr {
                        break-inside:avoid;
                    }
                }

            </style>

        </head>

        <body>

            ${buildOriginalSlipHTML(slip)}

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
            <strong>
                ${escapeHtml(firstValue(item.title, "Notification"))}
            </strong>

            <p>
                ${escapeHtml(firstValue(item.message, ""))}
            </p>
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

        showToast(
            error.message || "Logout failed.",
            "error"
        );
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

    $("closeSlipModal")?.addEventListener(
        "click",
        closeSlipModal
    );

    $("cancelSlipModal")?.addEventListener(
        "click",
        closeSlipModal
    );

    $("printSlipBtn")?.addEventListener(
        "click",
        printSelectedSlip
    );

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

    $("logoutBtn")?.addEventListener(
        "click",
        openLogoutModal
    );

    $("cancelLogout")?.addEventListener(
        "click",
        closeLogoutModal
    );

    $("confirmLogout")?.addEventListener(
        "click",
        confirmLogout
    );

    $("logoutModal")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
            closeLogoutModal();
        }
    });

    $("menuBtn")?.addEventListener(
        "click",
        openMobileMenu
    );

    $("sidebarOverlay")?.addEventListener(
        "click",
        closeMobileMenu
    );

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

        startSlipsRealtime();

        await loadSlips();

    } catch (error) {
        console.error(
            "Agency slips initialization failed:",
            error
        );

        showToast(
            error.message || "Agency Slips initialize nahi hua.",
            "error"
        );
    }
}

initializePage();