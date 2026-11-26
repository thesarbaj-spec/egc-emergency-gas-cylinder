/* =========================================================
   EGC OWNER SLIPS — GROUP PAYMENTS BY USER
   Supabase Configuration
========================================================= */

const SUPABASE_URL =
    "https://szefvmvokkhvnzryodqu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_S8aSsfmOKN6_7laRfgoMKA_Re2HzRS6";

const OWNER_STORAGE_KEY = "egc-owner-auth";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: OWNER_STORAGE_KEY
        }
    }
);

/* =========================================================
   CONFIGURATION
========================================================= */

const PAYMENT_TABLE = "payments";
const REQUEST_TABLE = "cylinder_requests";
const PROFILE_TABLE = "profiles";
const PAYMENTS_PER_PAGE = 10;
const SLIP_TABLE = "request_slips";

/* =========================================================
   STATE
========================================================= */

let allPayments = [];
let filteredGroups = [];
let currentPage = 1;
let currentPayment = null;
let paymentsRealtimeChannel = null;
let isLoadingPayments = false;
let paymentsReloadQueued = false;
let paymentsRealtimeTimer = null;
let isSigningOut = false;
let isPrinting = false;
let activePrintWindow = null;

/* =========================================================
   DOM
========================================================= */

const $ = id => document.getElementById(id);

const menuBtn = $("menuBtn");
const sidebar = $("sidebar");
const overlay = $("overlay");

const paymentsBody = $("paymentsBody");
const searchInput = $("searchInput");
const statusFilter = $("statusFilter");
const clearSearch = $("clearSearch");
const refreshBtn = $("refreshBtn");
const backBtn = $("backBtn");

const totalPayments = $("totalPayments");
const paidPayments = $("paidPayments");
const pendingPayments = $("pendingPayments");
const totalAmount = $("totalAmount");

const paginationInfo = $("paginationInfo");
const paginationButtons = $("paginationButtons");

const paymentModal = $("paymentModal");
const paymentModalClose = $("paymentModalClose");
const paymentCloseBtn = $("paymentCloseBtn");
const paymentDetails = $("paymentDetails");
const printSlipBtn = $("printSlipBtn");

const logoutBtn = $("logoutBtn");
const logoutModal = $("logoutModal");
const logoutCancel = $("logoutCancel");
const logoutConfirm = $("logoutConfirm");

/* =========================================================
   GENERAL HELPERS
========================================================= */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getValue(object, keys, fallback = "") {
    if (!object) return fallback;

    for (const key of keys) {
        if (
            object[key] !== undefined &&
            object[key] !== null &&
            object[key] !== ""
        ) {
            return object[key];
        }
    }

    return fallback;
}

function formatAmount(value) {
    const amount = Number(value || 0);

    return "₹" + (
        Number.isFinite(amount) ? amount : 0
    ).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getInitial(name) {
    return String(name || "C").trim().charAt(0).toUpperCase() || "C";
}

const profilePhotoCache = new Map();

async function getProfilePhotoUrl(path) {
if (!path) return "";

if (/^https?:\/\//i.test(path)) return path;

if (profilePhotoCache.has(path)) {
    return profilePhotoCache.get(path);
}

const { data, error } = await supabaseClient
    .storage
    .from("users-documents")
    .createSignedUrl(path, 3600);

if (error) {
    console.warn("Profile Photo Error:", error.message);
    return "";
}

const url = data?.signedUrl || "";

if (url) {
    profilePhotoCache.set(path, url);
}

return url;

}

/* =========================================================
   PAYMENT FIELD HELPERS
========================================================= */

function getUserId(payment) {
    return getValue(
        payment,
        ["user_id", "customer_id", "profile_id"],
        ""
    );
}

function getRequestId(payment) {
    return getValue(
        payment,
        [
            "request_id",
            "original_request_id",
            "cylinder_request_id",
            "requestId"
        ],
        ""
    );
}

function getPaymentId(payment) {
    return getValue(
        payment,
        [
            "payment_id",
            "transaction_id",
            "txn_id",
            "razorpay_payment_id",
            "reference_id",
            "id"
        ],
        "—"
    );
}

function getPaymentAmount(payment) {
    return Number(getValue(
        payment,
        ["payment_amount", "amount", "paid_amount"],
        0
    )) || 0;
}

function getPaymentType(payment) {
    const type = String(
        payment?.payment_type || ""
    ).toLowerCase().trim();

    if (type === "initial_payment") return "Initial Payment";
    if (type === "repayment") return "Repayment";

    return "Payment";
}

function getPaymentDate(payment) {
    return getValue(
        payment,
        ["paid_at", "payment_date", "created_at", "updated_at"],
        null
    );
}

function getPaymentMethod(payment) {
    return getValue(
        payment,
        ["payment_method", "method", "mode"],
        "UPI"
    );
}

/* =========================================================
   LATEST ACTIVITY SORTING
========================================================= */

function getLatestActivityTimestamp(payment) {
    if (!payment) return 0;

    const request = payment.__request || {};

    const timestamps = [
        // Payment activity
        payment.updated_at,
        payment.verified_at,
        payment.owner_approved_at,
        payment.approved_at,
        payment.paid_at,
        payment.payment_date,
        payment.created_at,

        // Related request activity
        request.updated_at,
        request.approved_at,
        request.owner_rejected_at,
        request.agency_updated_at,
        request.delivered_at,
        request.delivery_date,
        request.created_at,
        request.request_date
    ];

    const validTimes = timestamps
        .filter(Boolean)
        .map(value => new Date(value).getTime())
        .filter(value =>
            Number.isFinite(value) && value > 0
        );

    return validTimes.length
        ? Math.max(...validTimes)
        : 0;
}

function sortPaymentsByLatestActivity(list) {
    return [...list].sort((a, b) => {
        return (
            getLatestActivityTimestamp(b) -
            getLatestActivityTimestamp(a)
        );
    });
}

function sortGroupsByLatestActivity(groups) {
    return [...groups].sort((a, b) => {
        return (
            (b.latestActivity || 0) -
            (a.latestActivity || 0)
        );
    });
}

/* =========================================================
   SCREENSHOT DETECTION
========================================================= */

/*
  Screenshot can be stored in a dedicated screenshot column
  or, in some records, inside a reference field.

  Detect only URLs that appear to be image/storage URLs.
  A normal transaction reference must not be treated as
  a screenshot.
*/

function isScreenshotUrl(value) {
    if (typeof value !== "string") return false;

    const text = value.trim();

    if (!/^https?:\/\//i.test(text)) {
        return false;
    }

    try {
        const url = new URL(text);
        const path = decodeURIComponent(url.pathname).toLowerCase();

        return (
            path.includes("/payment-screenshots/") ||
            /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(path)
        );
    } catch (error) {
        return false;
    }
}

function getPaymentScreenshot(payment) {
    if (!payment) return "";

    const screenshotFields = [
        "screenshot_path",
        "screenshot_url",
        "payment_screenshot",
        "payment_screenshot_url",
        "screenshot",
        "proof_url",
        "proof_image",
        "receipt_url",
        "image_url",
        "payment_proof"
    ];

    for (const field of screenshotFields) {
        const value = payment[field];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    const referenceFields = [
        "payment_reference",
        "reference",
        "transaction_reference"
    ];

    for (const field of referenceFields) {
        const value = payment[field];

        if (isScreenshotUrl(value)) {
            return value.trim();
        }
    }

    return "";
}

/*
  Return the first actual reference that is NOT a screenshot
  URL. If none exists, return a dash.
*/

function getPaymentReference(payment) {
    const referenceFields = [
        "payment_reference",
        "reference",
        "transaction_reference",
        "utr",
        "upi_transaction_id",
        "transaction_ref",
        "bank_reference",
        "external_transaction_id"
    ];

    for (const field of referenceFields) {
        const value = payment?.[field];

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== "" &&
            !isScreenshotUrl(String(value))
        ) {
            return String(value).trim();
        }
    }

    /*
      Use a transaction ID only if it is not an image URL.
    */

    const transactionId = getValue(
        payment,
        [
            "razorpay_payment_id",
            "txn_id",
            "transaction_id"
        ],
        ""
    );

    if (
        transactionId &&
        !isScreenshotUrl(String(transactionId))
    ) {
        return String(transactionId);
    }

    return "—";
}

function createScreenshotRow(payment) {
    const screenshotUrl =
        payment?.__paymentScreenshotUrl || "";

    if (!screenshotUrl) {
        return `
            <div class="egc-screenshot-section">
                <div class="egc-screenshot-title">
                    Payment Screenshot
                </div>

                <div class="egc-screenshot-unavailable">
                    No screenshot available for this payment.
                </div>
            </div>
        `;
    }

    const safeUrl = escapeHtml(screenshotUrl);

    return `
        <div class="egc-screenshot-section">

            <div class="egc-screenshot-title">
                Payment Screenshot
            </div>

            <a
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="egc-screenshot-link"
            >
                <img
                    src="${safeUrl}"
                    alt="Payment Screenshot"
                    class="egc-payment-screenshot"
                    loading="eager"
                    onerror="
                        this.style.display='none';
                        const section=this.closest('.egc-screenshot-section');
                        const message=section?.querySelector('.egc-screenshot-error');
                        if(message) message.style.display='block';
                    "
                >
            </a>

            <div
                class="egc-screenshot-error"
                style="display:none;"
            >
                Screenshot could not be loaded.
                Please check Storage access permissions.
            </div>

            <a
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="egc-screenshot-open"
            >
                View Full Screenshot ↗
            </a>

        </div>
    `;
}

/* =========================================================
   FINAL PAYMENT & REPAYMENT DETAILS
========================================================= */

function getRequestFinancialDetails(payment) {
    const request = payment?.__request || {};
    const cylinderAmount = Number(request.cylinder_amount ?? request.base_amount ?? request.amount ?? request.total_amount ?? 0);
    const advanceAmount = Number(request.advance_amount ?? request.initial_payment ?? 0);
    const extraCharge = Number(request.charge_amount ?? request.extra_charge ?? request.extra_charge_amount ?? 0);
    const totalPayable = Number(request.total_payable ?? request.total_amount ?? (cylinderAmount + extraCharge));
    const remainingAmount = Number(request.remaining_amount ?? Math.max(0, totalPayable));
    const repaymentStatus = String(request.repayment_status || "pending").toLowerCase();
    const paymentType = getPaymentType(payment);
    const snapshot = request.__scheme_snapshot || null;
    const snapshotData = snapshot?.scheme_snapshot || snapshot || {};
    const schemeName = snapshot?.scheme_name || snapshotData?.scheme_name || snapshotData?.name || "Not recorded for this request";
    const slabs = Array.isArray(snapshotData?.slabs) ? snapshotData.slabs : [];
    return {
        cylinderAmount, advanceAmount, remainingAmount, extraCharge, totalPayable,
        repaymentStatus, paymentType,
        deliveryDate: getValue(request,["delivery_date","delivered_at"],null),
        dueDate: request.repayment_due_date || null,
        repaymentDays: request.repayment_days ?? "—",
        schemeName,
        schemeSlabs: slabs.map(s=>`${s.min_days}–${s.max_days ?? "+"}: ₹${s.extra_charge}`).join(" · ") || "Snapshot slab details unavailable"
    };
}

function createRepaymentDetails(payment) {
    const details = getRequestFinancialDetails(payment);

    return `
        <div class="egc-repayment-details">

            <h3 style="margin:20px 0 12px;">
                Cylinder & Repayment Details
            </h3>

            ${createSlipRow(
                "Cylinder Amount",
                formatAmount(details.cylinderAmount)
            )}
            ${createSlipRow("Extra Charge Scheme", details.schemeName)}
            ${createSlipRow("Saved Scheme Slabs", details.schemeSlabs)}

            ${createSlipRow(
                "Initial Payment",
                formatAmount(details.advanceAmount)
            )}

            ${createSlipRow(
                "Remaining Amount",
                formatAmount(details.remainingAmount)
            )}

            ${createSlipRow(
                "Extra Charge",
                formatAmount(details.extraCharge)
            )}

            ${createSlipRow(
                "Total Payable",
                formatAmount(details.totalPayable)
            )}

            ${createSlipRow(
                "Delivery Date",
                formatDateTime(details.deliveryDate)
            )}

            ${createSlipRow(
                "Repayment Due Date",
                formatDateTime(details.dueDate)
            )}

            ${createSlipRow(
                "Repayment Days",
                String(details.repaymentDays)
            )}

            ${createSlipRow(
                "Repayment Status",
                details.repaymentStatus.toUpperCase()
            )}

        </div>
    `;
}

/* =========================================================
   PAYMENT STATUS
========================================================= */

function normalizeStatus(payment) {
    const value = String(getValue(
        payment,
        ["status", "payment_status", "transaction_status"],
        "pending"
    )).toLowerCase().trim();

    if ([
        "paid",
        "success",
        "successful",
        "completed",
        "complete",
        "verified",
        "approved"
    ].includes(value)) {
        return "paid";
    }

    if ([
        "failed",
        "failure",
        "cancelled",
        "canceled",
        "rejected"
    ].includes(value)) {
        return "failed";
    }

    return "pending";
}

function statusLabel(status) {
    if (status === "paid") return "Paid";
    if (status === "failed") return "Failed";

    return "Pending";
}

/* =========================================================
   CUSTOMER DETAILS
========================================================= */

function getFinalCustomerName(payment) {
    return getValue(
        payment,
        ["customer_name", "full_name", "name"],
        getValue(
            payment.__profile,
            ["full_name", "name"],
            getValue(
                payment.__request,
                ["customer_name", "full_name", "name"],
                "Customer"
            )
        )
    );
}

function getFinalCustomerPhone(payment) {
    return getValue(
        payment,
        ["mobile", "phone", "mobile_number", "customer_mobile"],
        getValue(
            payment.__profile,
            ["mobile", "phone", "mobile_number"],
            getValue(
                payment.__request,
                ["mobile", "phone", "mobile_number", "customer_mobile"],
                "—"
            )
        )
    );
}

function getEmail(payment) {
    return getValue(
        payment,
        ["email", "customer_email"],
        getValue(payment.__profile, ["email"], "—")
    );
}

function getReadableUserId(payment) {
    const profile = payment.__profile || {};

    return getValue(
        profile,
        ["egc_user_id", "egc_id", "user_code", "customer_code"],
        getUserId(payment) || "Unknown User"
    );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function checkOwnerSession() {
    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error || !data?.session?.user) {
            window.location.replace("owner-login.html");
            return false;
        }

        return true;

    } catch (error) {
        console.error("Owner session error:", error);
        window.location.replace("owner-login.html");

        return false;
    }
}

/* =========================================================
   ENRICH PAYMENT DATA
========================================================= */

async function enrichPayments(payments) {
    if (!Array.isArray(payments) || !payments.length) return [];

    const userIds = [
        ...new Set(payments.map(getUserId).filter(Boolean).map(String))
    ];

    const requestIds = [
        ...new Set(payments.map(getRequestId).filter(Boolean).map(String))
    ];

    const paymentIds = [
        ...new Set(payments.map(payment => payment.id).filter(Boolean).map(String))
    ];

    let profiles = [];
    let requests = [];
    let slips = [];

    if (userIds.length) {
        const { data, error } = await supabaseClient
            .from(PROFILE_TABLE)
            .select("*")
            .in("id", userIds);

        if (error) {
            console.warn("Profile lookup:", error.message);
        } else {
            profiles = data || [];
        }
    }

    if (requestIds.length) {
        const { data, error } = await supabaseClient
            .from(REQUEST_TABLE)
            .select("*")
            .in("id", requestIds);

        if (error) {
            console.warn("Request lookup:", error.message);
        } else {
            requests = data || [];
        }
    }

    // Fetch original database slips
    if (paymentIds.length) {
        const { data, error } = await supabaseClient
            .from(SLIP_TABLE)
            .select("*")
            .in("payment_id", paymentIds)
            .eq("slip_type", "standard");

        if (error) {
            console.error("Slip lookup failed:", error.message);
        } else {
            slips = data || [];
        }
    }

    const profileMap = new Map(
        profiles.map(row => [String(row.id), row])
    );

    const requestMap = new Map(
        requests.map(row => [String(row.id), row])
    );

    // Request-specific immutable scheme snapshots; legacy requests may have none.
    const { data: schemeSnapshots, error: snapshotError } = requestIds.length
        ? await supabaseClient.from("request_scheme_snapshots").select("request_id,scheme_id,scheme_name,scheme_snapshot").in("request_id", requestIds)
        : { data: [], error: null };
    if (snapshotError) console.warn("Request scheme snapshot lookup:", snapshotError.message);
    const schemeSnapshotMap = new Map((schemeSnapshots || []).map(row => [String(row.request_id), row]));

    const slipMap = new Map(
        slips.map(row => [String(row.payment_id), row])
    );

    const enriched = payments.map(payment => {
        const request =
            requestMap.get(String(getRequestId(payment))) || null;
        if (request) request.__scheme_snapshot = schemeSnapshotMap.get(String(request.id)) || null;

        const linkedUserId =
            getUserId(payment) ||
            request?.user_id ||
            "";

        const profile =
            profileMap.get(String(linkedUserId)) || null;

        const slip =
            slipMap.get(String(payment.id)) || null;

        const profilePhotoPath = getValue(
            request,
            ["profile_photo"],
            getValue(
                profile,
                ["profile_photo", "avatar_url", "photo_url"],
                ""
            )
        );

        const screenshotPath = getPaymentScreenshot(payment);

        return {
            ...payment,
            __profile: profile,
            __request: request,
            __slip: slip,
            __profilePhotoPath: profilePhotoPath,
            __profilePhotoUrl: "",
            __paymentScreenshotPath: screenshotPath,
            __paymentScreenshotUrl: ""
        };
    });

    await Promise.all(
        enriched.map(async payment => {
            try {
                payment.__profilePhotoUrl =
                    await getProfilePhotoUrl(payment.__profilePhotoPath);

                if (payment.__paymentScreenshotPath) {
                    payment.__paymentScreenshotUrl =
                        await getPaymentScreenshotUrl(
                            payment.__paymentScreenshotPath
                        );
                }
            } catch (error) {
                console.warn("Payment enrichment error:", error);
            }
        })
    );

    console.log(
        "EGC PAYMENT SLIP DATABASE STATUS:",
        enriched.map(payment => ({
            paymentId: payment.id,
            requestId: getRequestId(payment),
            slipNumber: payment.__slip?.slip_number || "Slip not generated",
            verificationCode:
                payment.__slip?.verification_code || "Not available"
        }))
    );

    return enriched;
}


// ----------------------------------
// PAYMENT SCREENSHOT URL
// ----------------------------------

const paymentScreenshotCache = new Map();

async function getPaymentScreenshotUrl(path) {
    if (!path || typeof path !== "string") {
        return "";
    }

    let screenshotPath = path.trim();

    if (!screenshotPath) return "";

    const bucketName = "payment-screenshots";

    // Already stored as a complete URL
    if (/^https?:\/\//i.test(screenshotPath)) {
        try {
            const url = new URL(screenshotPath);

            const storageMatch = decodeURIComponent(url.pathname)
                .match(
                    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/payment-screenshots\/(.+)$/i
                );

            if (storageMatch) {
                screenshotPath = storageMatch[1];
            } else {
                return screenshotPath;
            }
        } catch (error) {
            console.warn(
                "Invalid payment screenshot URL:",
                error
            );
            return "";
        }
    }

    // Remove unnecessary bucket prefix
    screenshotPath = screenshotPath
        .replace(/^\/+/, "")
        .replace(/^payment-screenshots\/+/i, "");

    if (!screenshotPath) return "";

    // Use cached URL if available
    const cached = paymentScreenshotCache.get(screenshotPath);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    try {
        const { data, error } = await supabaseClient
            .storage
            .from(bucketName)
            .createSignedUrl(screenshotPath, 3600);

        if (error) {
            console.error(
                "Payment Screenshot Storage Error:",
                {
                    path: screenshotPath,
                    message: error.message
                }
            );

            return "";
        }

        const signedUrl = data?.signedUrl || "";

        if (signedUrl) {
            paymentScreenshotCache.set(screenshotPath, {
                url: signedUrl,
                expiresAt: Date.now() + 55 * 60 * 1000
            });
        }

        return signedUrl;

    } catch (error) {
        console.error(
            "Payment Screenshot URL Error:",
            error
        );

        return "";
    }
}

/* =========================================================
   LOAD PAYMENTS
========================================================= */

async function loadPayments() {
    if (isLoadingPayments) {
        paymentsReloadQueued = true;
        return;
    }

    if (!paymentsBody) return;

    isLoadingPayments = true;

    paymentsBody.innerHTML = `
        <tr>
            <td colspan="7" class="egc-loading">
                Loading payment slips...
            </td>
        </tr>
    `;

    try {
        let result = await supabaseClient
            .from(PAYMENT_TABLE)
            .select("*")
            .order("created_at", { ascending: false });

        let rows;

        if (!result.error) {
            rows = result.data || [];

        } else {
            console.warn(
                "Payments query failed; trying request records:",
                result.error.message
            );

            const requestResult = await supabaseClient
                .from(REQUEST_TABLE)
                .select("*")
                .order("created_at", { ascending: false });

            if (requestResult.error) {
                throw requestResult.error;
            }

            rows = (requestResult.data || []).filter(item =>
                item.payment_id ||
                item.transaction_id ||
                item.paid_amount ||
                item.payment_amount ||
                item.payment_status ||
                item.payment_date
            );
        }

        allPayments = await enrichPayments(rows);

        applyFilters();

    } catch (error) {
        console.error("Load payments error:", error);

        paymentsBody.innerHTML = `
            <tr>
                <td colspan="7" class="egc-empty">
                    Payment records load nahi ho sake.
                    <br><br>
                    ${escapeHtml(error.message || "Database error")}
                </td>
            </tr>
        `;

        updateStats();
        renderPagination();

    } finally {
    isLoadingPayments = false;

    if (paymentsReloadQueued) {
        paymentsReloadQueued = false;

        setTimeout(() => {
            loadPayments();
        }, 150);
    }
}
}

/* =========================================================
   GROUP PAYMENTS BY USER
========================================================= */

function getUserGroupKey(payment) {
    const request = payment.__request || {};
    const profile = payment.__profile || {};

    // सबसे पहले वास्तविक Database User ID
    const userId =
        profile.id ||
        payment.user_id ||
        payment.customer_id ||
        payment.profile_id ||
        request.user_id ||
        request.customer_id ||
        request.profile_id;

    if (userId) {
        return "user:" + String(userId).trim().toLowerCase();
    }

    // Fallback: EGC User ID
    const readableId = getValue(
        profile,
        ["user_code", "egc_user_id", "egc_id", "customer_code"],
        request.egc_user_code || ""
    );

    if (readableId) {
        return "egc:" + String(readableId).trim().toLowerCase();
    }

    return "payment:" + String(payment.id || getPaymentId(payment));
}

function groupPaymentsByUser(payments) {
const groups = new Map();

payments.forEach(payment => {
    const key = getUserGroupKey(payment);

    if (!groups.has(key)) {
        groups.set(key, {
            key,
            userId: getUserId(payment) ||
                getValue(
                    payment.__request,
                    ["user_id", "customer_id", "profile_id"],
                    ""
                ),
            requestId: getRequestId(payment),
            profile: payment.__profile || null,
            request: payment.__request || null,
            photoUrl: payment.__profilePhotoUrl || "",
            payments: []
        });
    }

    const group = groups.get(key);

    group.payments.push(payment);

    if (!group.profile && payment.__profile) {
        group.profile = payment.__profile;
    }

    if (!group.request && payment.__request) {
        group.request = payment.__request;
    }

    if (!group.photoUrl && payment.__profilePhotoUrl) {
        group.photoUrl = payment.__profilePhotoUrl;
    }
});

const result = [...groups.values()].map(group => {

    // पहले सभी payments को latest activity के अनुसार sort करें
    group.payments.sort((a, b) =>
        getLatestActivityTimestamp(b) -
        getLatestActivityTimestamp(a)
    );

    const latestPayment = group.payments[0] || {};
    const firstPayment = latestPayment;

    const paidList = group.payments.filter(
        payment => normalizeStatus(payment) === "paid"
    );

    const pendingList = group.payments.filter(
        payment => normalizeStatus(payment) === "pending"
    );

    const failedList = group.payments.filter(
        payment => normalizeStatus(payment) === "failed"
    );

    const paidTotal = paidList.reduce(
        (sum, payment) => sum + getPaymentAmount(payment),
        0
    );

    return {
        ...group,

        name: getFinalCustomerName(latestPayment),
        phone: getFinalCustomerPhone(latestPayment),
        readableId: getReadableUserId(latestPayment),

        totalCount: group.payments.length,
        paidCount: paidList.length,
        pendingCount: pendingList.length,
        failedCount: failedList.length,

        paidTotal,

        firstDate: getPaymentDate(latestPayment),

        latestActivity: Math.max(
            ...group.payments.map(payment =>
                getLatestActivityTimestamp(payment)
            )
        )
    };
});

return sortGroupsByLatestActivity(result);

}

/* =========================================================
   FILTERS
========================================================= */

function applyFilters() {
    const search = String(searchInput?.value || "")
        .trim()
        .toLowerCase();

    const selectedStatus = String(
        statusFilter?.value || "all"
    ).toLowerCase();

    let groups = groupPaymentsByUser(allPayments);

    groups = groups.filter(group => {
        if (selectedStatus !== "all") {
            const matching = group.payments.some(
                payment =>
                    normalizeStatus(payment) === selectedStatus
            );

            if (!matching) return false;
        }

        if (!search) return true;

        const searchable = [
            group.name,
            group.phone,
            group.readableId,
            group.userId,
            ...group.payments.map(payment => getRequestId(payment)),
            ...group.payments.map(payment => getPaymentId(payment)),
            ...group.payments.map(payment => getPaymentReference(payment))
        ].join(" ").toLowerCase();

        return searchable.includes(search);
    });

filteredGroups = sortGroupsByLatestActivity(groups);
currentPage = 1;

    renderPayments();
    updateStats();
    renderPagination();
}

/* =========================================================
   STATISTICS
========================================================= */

function updateStats() {
    const paid = allPayments.filter(
        payment => normalizeStatus(payment) === "paid"
    );

    const pending = allPayments.filter(
        payment => normalizeStatus(payment) === "pending"
    );

    const paidTotal = paid.reduce(
        (sum, payment) => sum + getPaymentAmount(payment),
        0
    );

    if (totalPayments) {
        totalPayments.textContent = allPayments.length;
    }

    if (paidPayments) {
        paidPayments.textContent = paid.length;
    }

    if (pendingPayments) {
        pendingPayments.textContent = pending.length;
    }

    if (totalAmount) {
        totalAmount.textContent = formatAmount(paidTotal);
    }
}

/* =========================================================
   RENDER ONE ROW PER USER
========================================================= */

function renderPayments() {
    if (!paymentsBody) return;

    if (!filteredGroups.length) {
        paymentsBody.innerHTML = `
            <tr>
                <td colspan="7" class="egc-empty">
                    No payment slips found.
                </td>
            </tr>
        `;

        return;
    }

    const start = (currentPage - 1) * PAYMENTS_PER_PAGE;

    const pageGroups = filteredGroups.slice(
        start,
        start + PAYMENTS_PER_PAGE
    );

    paymentsBody.innerHTML = pageGroups.map(group => {
        const statusText = group.pendingCount
            ? "Pending"
            : group.paidCount
                ? "Paid"
                : "Failed";

        const statusClass = group.pendingCount
            ? "pending"
            : group.paidCount
                ? "paid"
                : "failed";

        return `
            <tr>
                <td>
                    <div class="egc-customer">
                      <div class="egc-avatar">
    ${
        group.photoUrl
            ? `<img
                src="${escapeHtml(group.photoUrl)}"
                alt="${escapeHtml(group.name)}"
                style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
                onerror="this.style.display='none';this.parentElement.textContent='${escapeHtml(getInitial(group.name))}';"
            >`
            : escapeHtml(getInitial(group.name))
    }
</div>
                        </div>
                    </div>
                </td>

              <td>
    <div class="egc-id">
        ${escapeHtml(
            getRequestId(group.payments[0]) || "—"
        )}
    </div>
    <small>Request ID</small>
</td>

<td>
    <div class="egc-id">
        ${escapeHtml(
            getPaymentId(group.payments[0])
        )}
    </div>
    <small>Latest Payment ID</small>
</td>

                <td>
                    <strong>${group.totalCount}</strong>
                    <div class="egc-customer-phone">
                        ${group.paidCount} paid
                        ${group.pendingCount
                            ? " · " + group.pendingCount + " pending"
                            : ""}
                    </div>
                </td>

                <td>
                    <div class="egc-amount">
                        ${formatAmount(group.paidTotal)}
                    </div>
                </td>

                <td>
                    <span class="egc-status ${statusClass}">
                        ${statusText}
                    </span>
                </td>

                <td>
                    <button
                        type="button"
                        class="egc-action-btn"
                        data-view-user="${escapeHtml(group.key)}"
                    >
                        View All Slips (${group.totalCount})
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function getDatabaseSlipNumber(payment) {
    return payment?.__slip?.slip_number || "Slip not generated";
}

function getDatabaseVerificationCode(payment) {
    return payment?.__slip?.verification_code || "Not available";
}

function getDatabaseSlipDate(payment) {
    return payment?.__slip?.created_at ||
        getPaymentDate(payment);
}

/* =========================================================
   SLIP ROW HELPER
========================================================= */

function createSlipRow(label, value) {
    return `
        <div class="egc-slip-row">
            <span>${escapeHtml(label)}</span>
            <span>${escapeHtml(value)}</span>
        </div>
    `;
}

/* =========================================================
   VIEW ALL SLIPS FOR A USER
========================================================= */

function openUserSlips(groupKey) {
    const group = filteredGroups.find(
        item => item.key === groupKey
    );

    if (!group || !paymentModal || !paymentDetails) return;

    currentPayment = null;

    const title = $("paymentModalTitle");
    const subtitle = $("paymentModalSubtitle");

    if (title) {
        title.textContent = "Customer Payment Slips";
    }

    if (subtitle) {
        subtitle.textContent =
            group.name + " · " + group.totalCount + " payment(s)";
    }

    const firstPayment = group.payments[0];

    group.payments.sort((a, b) =>
    getLatestActivityTimestamp(b) -
    getLatestActivityTimestamp(a)
);

const latestPayment = group.payments[0];

    paymentDetails.innerHTML = `
        <div class="egc-detail-grid">
            <div class="egc-detail-box">
                <div class="egc-detail-label">Customer</div>
                <div class="egc-detail-value">
                    ${escapeHtml(group.name)}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">EGC User ID</div>
                <div class="egc-detail-value">
                    ${escapeHtml(group.readableId)}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">Database User ID</div>
                <div class="egc-detail-value">
                    ${escapeHtml(group.userId || "—")}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">Mobile</div>
                <div class="egc-detail-value">
                    ${escapeHtml(group.phone)}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">Email</div>
                <div class="egc-detail-value">
                    ${escapeHtml(getEmail(firstPayment))}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">Total Payments</div>
                <div class="egc-detail-value">
                    ${group.totalCount}
                </div>
            </div>

            <div class="egc-detail-box">
                <div class="egc-detail-label">Total Paid</div>
                <div class="egc-detail-value amount">
                    ${formatAmount(group.paidTotal)}
                </div>
            </div>
        </div>

        <h3 style="margin:22px 0 12px;">
            All Payment Slips
        </h3>

        <div class="egc-user-slip-list">
            ${group.payments.map((payment, index) => {
                const status = normalizeStatus(payment);

                return `
                    <div class="egc-slip-box">
                        <div class="egc-slip-head">
                            <div class="egc-slip-heading">
                                Payment Slip ${index + 1}
                            </div>

                            <div class="egc-slip-small">
                                ${escapeHtml(formatDateTime(
                                    getPaymentDate(payment)
                                ))}
                            </div>

                            <span class="egc-slip-status ${status}">
                                ${statusLabel(status)}
                            </span>
                        </div>

                        <div class="egc-slip-body">
                            ${createSlipRow("Customer", group.name)}
                            ${createSlipRow("EGC User ID", group.readableId)}
                            ${createSlipRow("Database User ID", group.userId || "—")}
                            ${createSlipRow("Mobile", group.phone)}
                            ${createSlipRow("Request ID", getRequestId(payment) || "—")}
                            ${createSlipRow("Payment ID", getPaymentId(payment))}
                            ${createSlipRow("Payment Method", getPaymentMethod(payment))}
                            ${createSlipRow("Transaction Reference", getPaymentReference(payment))}
                            ${createScreenshotRow(payment)}
                            ${createSlipRow("Payment Type", getPaymentType(payment))}

${createSlipRow(
    "Payment Verification",
    getValue(payment, ["verification_status"], "—")
)}

${createSlipRow(
    "Owner Approval",
    payment.owner_approved_at ? "Approved" : "Not Approved"
)}

${createRepaymentDetails(payment)}
                            ${createSlipRow("Payment Date", formatDateTime(getPaymentDate(payment)))}
                            ${createSlipRow("Status", statusLabel(status))}

                          <div class="egc-slip-total">
    <span>${escapeHtml(getPaymentType(payment))}</span>
    <span>${formatAmount(getPaymentAmount(payment))}</span>
</div>

                            <button
                                type="button"
                                class="egc-action-btn print"
                                data-print-user-payment="${escapeHtml(
                                    String(payment.id || "")
                                )}"
                                data-print-group="${escapeHtml(group.key)}"
                            >
                                Print This Slip
                            </button>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;

    if (printSlipBtn) {
        printSlipBtn.style.display = "none";
    }

    paymentModal.classList.add("show");
    document.body.style.overflow = "hidden";
}

/* =========================================================
   INDIVIDUAL PAYMENT SLIP
========================================================= */

function openPaymentModal(payment) {
    if (!payment || !paymentModal || !paymentDetails) return;

    currentPayment = payment;

    const name = getFinalCustomerName(payment);
    const phone = getFinalCustomerPhone(payment);
    const userId = getUserId(payment) || "—";
    const readableId = getReadableUserId(payment);
    const requestId = getRequestId(payment) || "—";
    const paymentId = getPaymentId(payment);
    const amount = getPaymentAmount(payment);
    const status = normalizeStatus(payment);
    const request = payment.__request || {};

    if ($("paymentModalTitle")) {
        $("paymentModalTitle").textContent = "Payment Receipt";
    }

    if ($("paymentModalSubtitle")) {
        $("paymentModalSubtitle").textContent =
            name + " · " + statusLabel(status);
    }

    if (printSlipBtn) {
        printSlipBtn.style.display = "";
    }

    paymentDetails.innerHTML = `
        <div id="slipPrintArea" class="egc-slip-box">
            <div class="egc-slip-head">
                <img
                    src="assets/EGC - Emergency Gas Cylinder logo.png"
                    class="egc-slip-logo"
                    alt="EGC Logo"
                >

                <div class="egc-slip-heading">Payment Receipt</div>

                <div class="egc-slip-small">
                    Short-Term Emergency LPG Finance
                </div>

                <span class="egc-slip-status ${status}">
                    ${statusLabel(status)}
                </span>
            </div>

            <div class="egc-slip-body">
                ${createSlipRow("Customer", name)}
                ${createSlipRow("Mobile", phone)}
                ${createSlipRow("Email", getEmail(payment))}
                ${createSlipRow("EGC User ID", readableId)}
                ${createSlipRow("Database User ID", userId)}
                ${createSlipRow("Request ID", requestId)}
                ${createSlipRow("Payment ID", paymentId)}
                ${createSlipRow("Payment Method", getPaymentMethod(payment))}
                ${createSlipRow("Transaction Reference", getPaymentReference(payment))}
                ${createScreenshotRow(payment)}
                ${createSlipRow("State", getValue(request, ["state"], "—"))}
                ${createSlipRow("District", getValue(request, ["district"], "—"))}
                ${createSlipRow("City", getValue(request, ["city"], "—"))}
                ${createSlipRow("LPG Company", getValue(request, ["lpg_company", "gas_company", "company"], "—"))}
                ${createSlipRow("LPG Agency", getValue(request, ["lpg_agency", "gas_agency", "agency_name"], "—"))}
                ${createSlipRow("Payment Date", formatDateTime(getPaymentDate(payment)))}
                ${createSlipRow("Slip Number", getDatabaseSlipNumber(payment))}
${createSlipRow("Verification Code", getDatabaseVerificationCode(payment))}
${createSlipRow("Slip Date", formatDateTime(getDatabaseSlipDate(payment)))}
${createSlipRow("Request Number", getValue(request, ["request_number"], requestId))}
                ${createRepaymentDetails(payment)}

                <div class="egc-slip-total">
                    <span>Payment Amount</span>
                    <span>${formatAmount(amount)}</span>
                </div>

                <div class="egc-slip-note">
                    This receipt reflects the payment information
                    available in the EGC database.
                </div>
            </div>
        </div>
    `;

    paymentModal.classList.add("show");
    document.body.style.overflow = "hidden";
}

/* =========================================================
   PRINT HELPERS
========================================================= */

function waitForImages(container, timeoutMs = 8000) {
    const images = Array.from(container.querySelectorAll("img"));

    const imagePromises = images.map(img => {
        if (img.complete) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const finish = () => resolve();

            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
        });
    });

    return Promise.race([
        Promise.all(imagePromises),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
}

async function printPaymentSlip(payment) {
    if (!payment || isPrinting) return;

    /*
      Open the print window immediately after the user click,
      to reduce popup-blocker issues.
    */

    const printWindow = window.open(
        "",
        "_blank",
        "width=850,height=700"
    );

    if (!printWindow) {
        alert("Print window blocked. Please allow pop-ups.");
        return;
    }

    activePrintWindow = printWindow;
    isPrinting = true;

    try {
        openPaymentModal(payment);

        const printArea = $("slipPrintArea");

        if (!printArea) {
            throw new Error("Payment slip could not be created.");
        }

        const slipHtml = printArea.outerHTML;

        printWindow.document.open();
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EGC Payment Receipt</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#173f60}.egc-slip-box{max-width:760px;margin:auto;background:#fff}img{max-width:100%}@media print{body{padding:0}}</style></head><body>${slipHtml}</body></html>`);
        printWindow.document.close();

        await waitForImages(printWindow.document.body);

        printWindow.focus();

        setTimeout(() => {
            try {
                printWindow.print();
            } catch (error) {
                console.error("Print error:", error);
                alert("Unable to print the receipt.");
            } finally {
                isPrinting = false;
                activePrintWindow = null;
            }
        }, 300);

    } catch (error) {
        console.error("Print slip error:", error);

        isPrinting = false;
        activePrintWindow = null;

        try {
            printWindow.close();
        } catch {}

        alert(error.message || "Unable to print the receipt.");
    }
}

/* =========================================================
   TABLE ACTIONS
========================================================= */

if (paymentsBody) {
    paymentsBody.addEventListener("click", event => {
        const userButton = event.target.closest("[data-view-user]");

        if (userButton) {
            openUserSlips(userButton.dataset.viewUser);
            return;
        }

        const printButton = event.target.closest(
            "[data-print-user-payment]"
        );

        if (printButton) {
            const paymentId =
                printButton.dataset.printUserPayment;

            const payment = allPayments.find(
                item => String(item.id) === String(paymentId)
            );

            if (payment) {
                printPaymentSlip(payment);
            }

            return;
        }

        const viewButton = event.target.closest("[data-view-payment]");

        if (viewButton) {
            const payment = allPayments.find(
                item => String(item.id) ===
                    String(viewButton.dataset.viewPayment)
            );

            if (payment) openPaymentModal(payment);

            return;
        }

        const singlePrint = event.target.closest("[data-print-payment]");

        if (singlePrint) {
            const payment = allPayments.find(
                item => String(item.id) ===
                    String(singlePrint.dataset.printPayment)
            );

            if (payment) printPaymentSlip(payment);
        }
    });
}

/* =========================================================
   PAGINATION
========================================================= */

function renderPagination() {
    if (!paginationButtons || !paginationInfo) return;

    paginationButtons.innerHTML = "";

    if (!filteredGroups.length) {
        paginationInfo.textContent = "Showing 0 users";
        return;
    }

    const totalPages = Math.ceil(
        filteredGroups.length / PAYMENTS_PER_PAGE
    );

    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAYMENTS_PER_PAGE + 1;

    const end = Math.min(
        currentPage * PAYMENTS_PER_PAGE,
        filteredGroups.length
    );

    paginationInfo.textContent =
        `Showing ${start}–${end} of ${filteredGroups.length} users`;

    if (totalPages <= 1) return;

    function addButton(label, page, disabled = false, active = false) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "egc-page-btn";
        button.textContent = label;
        button.disabled = disabled;

        if (active) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            if (page < 1 || page > totalPages) return;

            currentPage = page;

            renderPayments();
            renderPagination();
        });

        paginationButtons.appendChild(button);
    }

    addButton("‹", currentPage - 1, currentPage === 1);

    let first = Math.max(1, currentPage - 2);
    let last = Math.min(totalPages, first + 4);

    if (last - first < 4) {
        first = Math.max(1, last - 4);
    }

    for (let page = first; page <= last; page++) {
        addButton(
            String(page),
            page,
            false,
            page === currentPage
        );
    }

    addButton("›", currentPage + 1, currentPage === totalPages);
}

/* =========================================================
   CLOSE PAYMENT MODAL
========================================================= */

function closePaymentModal() {
    paymentModal?.classList.remove("show");

    currentPayment = null;

    if (printSlipBtn) {
        printSlipBtn.style.display = "";
    }

    if (!logoutModal?.classList.contains("show")) {
        document.body.style.overflow = "";
    }
}

paymentModalClose?.addEventListener("click", closePaymentModal);
paymentCloseBtn?.addEventListener("click", closePaymentModal);

paymentModal?.addEventListener("click", event => {
    if (event.target === paymentModal) {
        closePaymentModal();
    }
});

printSlipBtn?.addEventListener("click", () => {
    if (currentPayment) {
        printPaymentSlip(currentPayment);
    }
});

/* =========================================================
   SEARCH AND FILTER EVENTS
========================================================= */

searchInput?.addEventListener("input", applyFilters);
statusFilter?.addEventListener("change", applyFilters);

clearSearch?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (statusFilter) statusFilter.value = "all";

    applyFilters();
});

/* =========================================================
   REFRESH
========================================================= */

refreshBtn?.addEventListener("click", async () => {
    if (isLoadingPayments) return;

    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading...";

    try {
        await loadPayments();
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "↻ Refresh";
    }
});

/* =========================================================
   NAVIGATION
========================================================= */

function closeMobileMenu() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
}

menuBtn?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
    overlay?.classList.toggle("show");
});

overlay?.addEventListener("click", closeMobileMenu);

function goToPage(page) {
    closeMobileMenu();
    window.location.href = page;
}

$("dashboardBtn")?.addEventListener("click", () =>
    goToPage("owner-dashboard.html")
);

$("customersBtn")?.addEventListener("click", () =>
    goToPage("owner-users.html")
);

$("agenciesBtn")?.addEventListener("click", () =>
    goToPage("owner-agencies.html")
);

$("requestsBtn")?.addEventListener("click", () =>
    goToPage("owner-requests.html")
);

$("settingsBtn")?.addEventListener("click", () =>
    goToPage("owner-settings.html")
);

backBtn?.addEventListener("click", () =>
    goToPage("owner-dashboard.html")
);

/* =========================================================
   LOGOUT
========================================================= */

function openLogoutModal() {
    closeMobileMenu();

    if (logoutModal) {
        logoutModal.classList.add("show");
        document.body.style.overflow = "hidden";

    } else if (confirm("Are you sure you want to logout?")) {
        performLogout();
    }
}

function closeLogoutModal() {
    logoutModal?.classList.remove("show");

    if (!paymentModal?.classList.contains("show")) {
        document.body.style.overflow = "";
    }
}

logoutBtn?.addEventListener("click", openLogoutModal);
logoutCancel?.addEventListener("click", closeLogoutModal);

logoutModal?.addEventListener("click", event => {
    if (event.target === logoutModal) {
        closeLogoutModal();
    }
});

logoutConfirm?.addEventListener("click", performLogout);

async function performLogout() {
    if (isSigningOut) return;

    isSigningOut = true;

    if (logoutConfirm) {
        logoutConfirm.disabled = true;
        logoutConfirm.textContent = "Logging out...";
    }

    try {
        stopPaymentsRealtime();

        const { error } = await supabaseClient.auth.signOut();

        if (error) throw error;

        window.location.replace("owner-login.html");

    } catch (error) {
        console.error("Logout error:", error);

        isSigningOut = false;

        if (logoutConfirm) {
            logoutConfirm.disabled = false;
            logoutConfirm.textContent = "Logout";
        }

        alert(error.message || "Logout failed. Please try again.");
    }
}

/* =========================================================
   REALTIME — PAYMENTS + REQUESTS + PROFILES
========================================================= */

function stopPaymentsRealtime() {

    if (paymentsRealtimeTimer) {
        clearTimeout(paymentsRealtimeTimer);
        paymentsRealtimeTimer = null;
    }

    if (!paymentsRealtimeChannel) return;

    const channel = paymentsRealtimeChannel;
    paymentsRealtimeChannel = null;

    supabaseClient.removeChannel(channel).catch(error => {
        console.warn(
            "Payments Realtime removal error:",
            error
        );
    });
}

function schedulePaymentsRefresh() {

    clearTimeout(paymentsRealtimeTimer);

    paymentsRealtimeTimer = setTimeout(() => {

        paymentsRealtimeTimer = null;

        if (isSigningOut) return;

        console.log(
            "Refreshing Owner Slips after latest activity..."
        );

        loadPayments();

    }, 700);
}

function startPaymentsRealtime() {

    stopPaymentsRealtime();

    console.log(
        "Starting Owner Slips Realtime..."
    );

    paymentsRealtimeChannel = supabaseClient

        .channel("owner-slips-realtime")

        // Payment INSERT / UPDATE / DELETE
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: PAYMENT_TABLE
            },
            payload => {

                console.log(
                    "Payments Realtime Event:",
                    payload.eventType,
                    payload
                );

                schedulePaymentsRefresh();
            }
        )

        // Request INSERT / UPDATE / DELETE
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: REQUEST_TABLE
            },
            payload => {

                console.log(
                    "Request Realtime Event:",
                    payload.eventType,
                    payload
                );

                schedulePaymentsRefresh();
            }
        )

        // Customer Profile changes
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: PROFILE_TABLE
            },
            payload => {

                console.log(
                    "Profile Realtime Event:",
                    payload.eventType,
                    payload
                );

                schedulePaymentsRefresh();
            }
        )

        .subscribe((status, error) => {

            console.log(
                "EGC Owner Slips Realtime Status:",
                status
            );

            if (status === "SUBSCRIBED") {

                console.log(
                    "✅ Owner Slips Realtime Connected"
                );
            }

            if (status === "CHANNEL_ERROR") {

                console.error(
                    "❌ Owner Slips Realtime Error:",
                    error
                );
            }

            if (status === "TIMED_OUT") {

                console.warn(
                    "⚠️ Owner Slips Realtime Timed Out"
                );
            }

            if (status === "CLOSED") {

                console.warn(
                    "Owner Slips Realtime Channel Closed"
                );
            }
        });
}
/* =========================================================
   AUTH STATE
========================================================= */

const { data: authListener } =
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" && !isSigningOut) {
            stopPaymentsRealtime();
            window.location.replace("owner-login.html");
        }

        if (event === "SIGNED_IN" && session?.user) {
            console.log("Owner session active.");
        }
    });

/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        if (paymentModal?.classList.contains("show")) {
            closePaymentModal();

        } else if (logoutModal?.classList.contains("show")) {
            closeLogoutModal();

        } else {
            closeMobileMenu();
        }
    }
});

/* =========================================================
   INITIALIZE
========================================================= */

async function initOwnerSlips() {
    const sessionOK = await checkOwnerSession();

    if (!sessionOK) return;

    await loadPayments();
    startPaymentsRealtime();
}

initOwnerSlips();

/* =========================================================
   CLEANUP + PAGE RESTORE
========================================================= */

window.addEventListener("pagehide", () => {

    stopPaymentsRealtime();

    authListener?.subscription?.unsubscribe();

    if (
        activePrintWindow &&
        !activePrintWindow.closed
    ) {
        try {
            activePrintWindow.close();
        } catch {}
    }
});

window.addEventListener("pageshow", async event => {

    if (!event.persisted) return;

    console.log(
        "Owner Slips page restored from BFCache."
    );

    const sessionOK = await checkOwnerSession();

    if (!sessionOK) return;

    await loadPayments();

    startPaymentsRealtime();
});

document.addEventListener("visibilitychange", () => {

    if (
        document.visibilityState !== "visible" ||
        !paymentsRealtimeChannel ||
        isSigningOut
    ) {
        return;
    }

    loadPayments();
});
