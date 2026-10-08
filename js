/* =========================================================
   EGC AGENCY DASHBOARD
   COMPLETE CLEAN JAVASCRIPT
   ========================================================= */

"use strict";


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
    "https://szefvmvokkhvnzryodqu.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_S8aSsfmOKN6_7laRfgoMKA_Re2HzRS6";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let currentAgency = null;
let agencyId = null;

let agencyRequests = [];
let approvedPayments = [];
let agencyCustomers = [];

let notifications = [];

let realtimeChannel = null;
let notificationChannel = null;
let paymentRealtimeChannel = null;

let toastTimer = null;


/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = id =>
    document.getElementById(id);

const menuBtn =
    $("menuBtn");

const sidebar =
    $("sidebar");

const overlay =
    $("overlay");

const notificationBtn =
    $("notificationBtn");

const notificationPanel =
    $("notificationPanel");

const notificationList =
    $("notificationList");

const notificationCount =
    $("notificationCount");

const sidebarNotificationCount =
    $("sidebarNotificationCount");

const markAllRead =
    $("markAllRead");

const customerTableBody =
    $("customerTableBody");

const holdTableBody =
    $("holdTableBody");

const recentTableBody =
    $("recentTableBody");

const monthlySummary =
    $("monthlySummary");

const yearlySummary =
    $("yearlySummary");

const searchInput =
    $("searchInput");

const paymentFilter =
    $("paymentFilter");

const requestFilter =
    $("requestFilter");

const monthFilter =
    $("monthFilter");

const customerModal =
    $("customerModal");

const customerClose =
    $("customerClose");

const settingsModal =
    $("settingsModal");

const settingsClose =
    $("settingsClose");

const logoutModal =
    $("logoutModal");

const logoutBtn =
    $("logoutBtn");

const logoutCancel =
    $("logoutCancel");

const logoutConfirm =
    $("logoutConfirm");

const resetPasswordBtn =
    $("resetPasswordBtn");

const settingsMessage =
    $("settingsMessage");

const toast =
    $("toast");

const toastTitle =
    $("toastTitle");

const toastText =
    $("toastText");


/* =========================================================
   SAFE VALUE HELPERS
   ========================================================= */

function valueOf(
    row,
    keys,
    fallback = ""
){

    if(!row){
        return fallback;
    }

    for(const key of keys){

        if(
            row[key] !== undefined &&
            row[key] !== null &&
            String(row[key]).trim() !== ""
        ){

            return row[key];

        }

    }

    return fallback;
}


function lower(
    value
){

    return String(
        value || ""
    )
    .toLowerCase()
    .trim();

}


function money(
    value
){

    const number =
        Number(value) || 0;

    return (
        "₹" +
        number.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits:2,
                maximumFractionDigits:2
            }
        )
    );

}


function numberValue(
    value
){

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : 0;

}


function escapeHtml(
    value
){

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );

}


function formatDate(
    value
){

    if(!value){
        return "—";
    }

    const date =
        new Date(value);

    if(
        Number.isNaN(
            date.getTime()
        )
    ){

        return String(value);

    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day:"2-digit",
            month:"short",
            year:"numeric"
        }
    );

}


function dateValue(
    row
){

    return valueOf(
        row,
        [
            "created_at",
            "updated_at",
            "request_date",
            "payment_date",
            "delivery_date"
        ],
        ""
    );

}


/* =========================================================
   APPROVED PAYMENT STATUS
   ========================================================= */

function isApprovedPaymentStatus(
    status
){

    const s =
        lower(status);

    return [
        "approved",
        "success",
        "successful",
        "paid",
        "completed",
        "complete"
    ].includes(s);

}


/* =========================================================
   PAYMENT STATUS
   ========================================================= */

function getPaymentStatus(
    payment
){

    if(!payment){
        return "pending";
    }

    return lower(
        valueOf(
            payment,
            [
                "status",
                "payment_status"
            ],
            "pending"
        )
    );

}


/* =========================================================
   REQUEST PAYMENT MATCH
   ========================================================= */

function getPaymentRequestId(
    payment
){

    return String(
        valueOf(
            payment,
            [
                "request_id",
                "cylinder_request_id",
                "requestId",
                "cylinderRequestId"
            ],
            ""
        )
    );

}


function getRequestId(
    request
){

    return String(
        valueOf(
            request,
            [
                "id",
                "request_id"
            ],
            ""
        )
    );

}


function getRequestNumber(
    request
){

    return valueOf(
        request,
        [
            "request_number",
            "request_no",
            "requestNumber"
        ],
        "Request"
    );

}


/* =========================================================
   CUSTOMER / PROFILE ID
   ========================================================= */

function getUserId(
    row
){

    return String(
        valueOf(
            row,
            [
                "user_id",
                "customer_id",
                "profile_id",
                "userId"
            ],
            ""
        )
    );

}


/* =========================================================
   FIND PAYMENT FOR REQUEST
   ========================================================= */

function getPaymentForRequest(
    request
){

    const requestId =
        getRequestId(
            request
        );

    if(!requestId){
        return null;
    }

    return (
        approvedPayments.find(
            payment =>
                getPaymentRequestId(
                    payment
                ) === requestId
        ) ||
        null
    );

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    title,
    message
){

    if(!toast){
        return;
    }

    if(toastTimer){
        clearTimeout(
            toastTimer
        );
    }

    if(toastTitle){
        toastTitle.textContent =
            title || "Notification";
    }

    if(toastText){
        toastText.textContent =
            message || "";
    }

    toast.classList.add(
        "show"
    );

    toastTimer =
        setTimeout(
            function(){

                toast.classList.remove(
                    "show"
                );

            },
            3500
        );

}


/* =========================================================
   NOTIFICATION SOUND
   ========================================================= */

function playNotificationSound(){

    try{

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if(!AudioContext){
            return;
        }

        const context =
            new AudioContext();

        const oscillator =
            context.createOscillator();

        const gain =
            context.createGain();

        oscillator.type =
            "sine";

        oscillator.frequency.value =
            760;

        gain.gain.value =
            0.045;

        oscillator.connect(
            gain
        );

        gain.connect(
            context.destination
        );

        oscillator.start();

        oscillator.stop(
            context.currentTime +
            0.13
        );

    }
    catch(error){

        console.log(
            "Notification sound unavailable:",
            error
        );

    }

}


/* =========================================================
   SESSION
   ========================================================= */

async function checkSession(){

    try{

        const {
            data,
            error
        } =
        await supabaseClient.auth.getUser();

        if(error){
            throw error;
        }

        currentUser =
            data &&
            data.user
                ? data.user
                : null;

        if(!currentUser){

            window.location.replace(
                "agency-login.html"
            );

            return false;

        }

        return true;

    }
    catch(error){

        console.error(
            "Session error:",
            error
        );

        window.location.replace(
            "agency-login.html"
        );

        return false;

    }

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadCurrentProfile(){

    if(!currentUser){
        return false;
    }

    try{

        const {
            data,
            error
        } =
        await supabaseClient
        .from("profiles")
        .select("*")
        .eq(
            "id",
            currentUser.id
        )
        .maybeSingle();

        if(error){
            throw error;
        }

        currentProfile =
            data || null;

        if(!currentProfile){

            showToast(
                "Profile Error",
                "Agency profile was not found."
            );

            return false;

        }

        agencyId =
            valueOf(
                currentProfile,
                [
                    "agency_id",
                    "agencyId"
                ],
                null
            );

        if(!agencyId){

            showToast(
                "Agency Error",
                "This account is not linked to an agency."
            );

            return false;

        }

        return true;

    }
    catch(error){

        console.error(
            "Profile loading error:",
            error
        );

        showToast(
            "Profile Error",
            error.message ||
            "Unable to load agency profile."
        );

        return false;

    }

}


/* =========================================================
   LOAD AGENCY
   ========================================================= */

async function loadAgency(){

    if(!agencyId){
        return false;
    }

    try{

        const {
            data,
            error
        } =
        await supabaseClient
        .from("agencies")
        .select("*")
        .eq(
            "id",
            agencyId
        )
        .maybeSingle();

        if(error){
            throw error;
        }

        currentAgency =
            data || null;

        if(!currentAgency){

            showToast(
                "Agency Error",
                "Agency details were not found."
            );

            return false;

        }

        renderAgency();

        return true;

    }
    catch(error){

        console.error(
            "Agency loading error:",
            error
        );

        showToast(
            "Agency Error",
            error.message ||
            "Unable to load agency."
        );

        return false;

    }

}


/* =========================================================
   RENDER AGENCY
   ========================================================= */

function renderAgency(){

    if(!currentAgency){
        return;
    }

    const name =
        valueOf(
            currentAgency,
            [
                "name",
                "agency_name",
                "agencyName"
            ],
            "LPG Agency"
        );

    const code =
        valueOf(
            currentAgency,
            [
                "agency_code",
                "code",
                "agencyCode"
            ],
            "—"
        );

    const company =
        valueOf(
            currentAgency,
            [
                "lpg_company",
                "company",
                "company_name",
                "lpgCompany"
            ],
            "—"
        );

    const city =
        valueOf(
            currentAgency,
            [
                "city",
                "district_city"
            ],
            "—"
        );

    const status =
        valueOf(
            currentAgency,
            [
                "status",
                "agency_status"
            ],
            "Active"
        );


    if(
        $("headerAgencyName")
    ){

        $("headerAgencyName")
            .textContent =
            name;

    }

    if(
        $("agencyName")
    ){

        $("agencyName")
            .textContent =
            name;

    }

    if(
        $("agencyCode")
    ){

        $("agencyCode")
            .textContent =
            code;

    }

    if(
        $("agencyCompany")
    ){

        $("agencyCompany")
            .textContent =
            company;

    }

    if(
        $("agencyCity")
    ){

        $("agencyCity")
            .textContent =
            city;

    }

    if(
        $("agencyStatus")
    ){

        $("agencyStatus")
            .textContent =
            status;

    }


    if(
        $("settingsAgencyName")
    ){

        $("settingsAgencyName")
            .textContent =
            name;

    }

    if(
        $("settingsAgencyId")
    ){

        $("settingsAgencyId")
            .textContent =
            agencyId || "—";

    }

    if(
        $("settingsMobile")
    ){

        $("settingsMobile")
            .textContent =
            valueOf(
                currentAgency,
                [
                    "mobile",
                    "phone",
                    "contact"
                ],
                valueOf(
                    currentProfile,
                    [
                        "mobile",
                        "phone"
                    ],
                    "—"
                )
            );

    }

    if(
        $("settingsCompany")
    ){

        $("settingsCompany")
            .textContent =
            company;

    }

}


/* =========================================================
   LOAD OWNER APPROVED PAYMENTS
   ========================================================= */

async function loadApprovedPayments(){

    if(!agencyId){
        return false;
    }

    try{

        const {
            data,
            error
        } =
        await supabaseClient
        .from("payments")
        .select("*")
        .order(
            "created_at",
            {
                ascending:false
            }
        );

        if(error){
            throw error;
        }

        const allPayments =
            Array.isArray(data)
                ? data
                : [];

        approvedPayments =
            allPayments.filter(
                payment => {

                    const status =
                        getPaymentStatus(
                            payment
                        );

                    if(
                        !isApprovedPaymentStatus(
                            status
                        )
                    ){

                        return false;

                    }

                    const paymentAgency =
                        valueOf(
                            payment,
                            [
                                "agency_id",
                                "agencyId"
                            ],
                            ""
                        );

                    if(
                        paymentAgency &&
                        String(
                            paymentAgency
                        ) !==
                        String(
                            agencyId
                        )
                    ){

                        return false;

                    }

                    return true;

                }
            );

        return true;

    }
    catch(error){

        console.error(
            "Approved payments error:",
            error
        );

        approvedPayments =
            [];

        return false;

    }

}


/* =========================================================
   LOAD CYLINDER REQUESTS
   ========================================================= */

async function loadRequests(){

    if(!agencyId){
        return false;
    }

    try{

        const {
            data,
            error
        } =
        await supabaseClient
        .from("cylinder_requests")
        .select("*")
        .eq(
            "agency_id",
            agencyId
        )
        .order(
            "created_at",
            {
                ascending:false
            }
        );

        if(error){
            throw error;
        }

        const allRequests =
            Array.isArray(data)
                ? data
                : [];


        /*
           IMPORTANT:
           Only requests linked to an approved payment
           are shown on the Agency dashboard.
        */

        agencyRequests =
            allRequests.filter(
                request => {

                    const payment =
                        getPaymentForRequest(
                            request
                        );

                    return !!payment;

                }
            );


        /*
           Keep approved-payment requests available
           even when payment uses request_id.
        */

        return true;

    }
    catch(error){

        console.error(
            "Request loading error:",
            error
        );

        agencyRequests =
            [];

        if(customerTableBody){

            customerTableBody.innerHTML =
                `
                <tr>
                    <td colspan="10" class="empty">
                        Unable to load agency requests.
                    </td>
                </tr>
                `;

        }

        return false;

    }

}


/* =========================================================
   LOAD CUSTOMERS
   ========================================================= */

async function loadCustomers(){

    try{

        const userIds =
            [
                ...new Set(
                    agencyRequests
                    .map(
                        request =>
                            getUserId(
                                request
                            )
                    )
                    .filter(Boolean)
                )
            ];


        if(
            userIds.length === 0
        ){

            agencyCustomers =
                [];

            return true;

        }


        const {
            data,
            error
        } =
        await supabaseClient
        .from("profiles")
        .select("*")
        .in(
            "id",
            userIds
        );

        if(error){
            throw error;
        }

        agencyCustomers =
            Array.isArray(data)
                ? data
                : [];

        return true;

    }
    catch(error){

        console.error(
            "Customer loading error:",
            error
        );

        agencyCustomers =
            [];

        return false;

    }

}


/* =========================================================
   FIND PROFILE
   ========================================================= */

function findProfile(
    userId
){

    const id =
        String(
            userId || ""
        );

    return (
        agencyCustomers.find(
            profile =>
                String(
                    profile.id
                ) === id
        ) ||
        null
    );

}


/* =========================================================
   REQUEST STATUS
   ========================================================= */

function requestStatus(
    request
){

    return valueOf(
        request,
        [
            "status",
            "request_status"
        ],
        "Pending"
    );

}


function deliveryStatus(
    request
){

    return valueOf(
        request,
        [
            "delivery_status",
            "deliveryStatus"
        ],
        "Pending"
    );

}


/* =========================================================
   REQUEST AMOUNT
   ========================================================= */

function requestAmount(
    request
){

    const payment =
        getPaymentForRequest(
            request
        );

    if(payment){

        return numberValue(
            valueOf(
                payment,
                [
                    "amount",
                    "paid_amount",
                    "payment_amount"
                ],
                0
            )
        );

    }

    return numberValue(
        valueOf(
            request,
            [
                "amount",
                "total_amount",
                "finance_amount"
            ],
            0
        )
    );

}


/* =========================================================
   UPDATE COUNTERS
   ========================================================= */

function updateCounters(){

    const requests =
        agencyRequests;

    const totalRequests =
        requests.length;

    const totalUsers =
        new Set(
            requests
            .map(
                r =>
                    getUserId(r)
            )
            .filter(Boolean)
        ).size;

    const totalCylinders =
        requests.reduce(
            (
                total,
                request
            ) =>
                total +
                numberValue(
                    valueOf(
                        request,
                        [
                            "cylinder_count",
                            "cylinders",
                            "quantity"
                        ],
                        1
                    )
                ),
            0
        );


    let pending =
        0;

    let completed =
        0;

    let cancelled =
        0;

    let pendingCylinders =
        0;

    let deliveredCylinders =
        0;


    requests.forEach(
        request => {

            const status =
                lower(
                    requestStatus(
                        request
                    )
                );

            const delivery =
                lower(
                    deliveryStatus(
                        request
                    )
                );

            const cylinders =
                numberValue(
                    valueOf(
                        request,
                        [
                            "cylinder_count",
                            "cylinders",
                            "quantity"
                        ],
                        1
                    )
                );


            if(
                [
                    "pending",
                    "processing",
                    "on hold",
                    "hold"
                ].includes(status)
            ){

                pending++;

            }


            if(
                [
                    "completed",
                    "complete",
                    "delivered"
                ].includes(status) ||
                [
                    "completed",
                    "delivered"
                ].includes(delivery)
            ){

                completed++;

                deliveredCylinders +=
                    cylinders;

            }


            if(
                [
                    "cancelled",
                    "canceled"
                ].includes(status)
            ){

                cancelled++;

            }


            if(
                ![
                    "completed",
                    "complete",
                    "delivered",
                    "cancelled",
                    "canceled"
                ].includes(status)
            ){

                pendingCylinders +=
                    cylinders;

            }

        }
    );


    const paymentValues =
        approvedPayments;

    const totalReceived =
        paymentValues.reduce(
            (
                total,
                payment
            ) =>
                total +
                numberValue(
                    valueOf(
                        payment,
                        [
                            "amount",
                            "paid_amount",
                            "payment_amount"
                        ],
                        0
                    )
                ),
            0
        );


    const failedPayments =
        paymentValues.filter(
            payment =>
                [
                    "failed",
                    "rejected"
                ].includes(
                    getPaymentStatus(
                        payment
                    )
                )
        ).length;


    const paymentPending =
        Math.max(
            0,
            totalRequests -
            approvedPayments.length
        );


    const extraCharges =
        requests.reduce(
            (
                total,
                request
            ) =>
                total +
                numberValue(
                    valueOf(
                        request,
                        [
                            "extra_charges",
                            "extra_charge",
                            "delivery_charge"
                        ],
                        0
                    )
                ),
            0
        );


    const currentDate =
        new Date();

    const currentMonth =
        currentDate.getMonth();

    const currentYear =
        currentDate.getFullYear();


    const monthReceived =
        paymentValues.reduce(
            (
                total,
                payment
            ) => {

                const date =
                    new Date(
                        dateValue(
                            payment
                        )
                    );

                if(
                    date.getMonth() ===
                    currentMonth &&
                    date.getFullYear() ===
                    currentYear
                ){

                    return total +
                        numberValue(
                            valueOf(
                                payment,
                                [
                                    "amount",
                                    "paid_amount",
                                    "payment_amount"
                                ],
                                0
                            )
                        );

                }

                return total;

            },
            0
        );


    const yearReceived =
        paymentValues.reduce(
            (
                total,
                payment
            ) => {

                const date =
                    new Date(
                        dateValue(
                            payment
                        )
                    );

                if(
                    date.getFullYear() ===
                    currentYear
                ){

                    return total +
                        numberValue(
                            valueOf(
                                payment,
                                [
                                    "amount",
                                    "paid_amount",
                                    "payment_amount"
                                ],
                                0
                            )
                        );

                }

                return total;

            },
            0
        );


    const totalPendingAmount =
        requests.reduce(
            (
                total,
                request
            ) => {

                const payment =
                    getPaymentForRequest(
                        request
                    );

                if(!payment){

                    return total +
                        numberValue(
                            valueOf(
                                request,
                                [
                                    "amount",
                                    "total_amount",
                                    "finance_amount"
                                ],
                                0
                            )
                        );

                }

                return total;

            },
            0
        );


    const setText = (
        id,
        value
    ) => {

        const element =
            $(id);

        if(element){
            element.textContent =
                value;
        }

    };


    setText(
        "totalUsers",
        totalUsers
    );

    setText(
        "totalRequests",
        totalRequests
    );

    setText(
        "totalCylinders",
        totalCylinders
    );

    setText(
        "paymentsReceived",
        approvedPayments.length
    );

    setText(
        "pendingRequests",
        pending
    );

    setText(
        "completedRequests",
        completed
    );

    setText(
        "cancelledRequests",
        cancelled
    );

    setText(
        "paymentsPending",
        paymentPending
    );

    setText(
        "pendingCylinders",
        pendingCylinders
    );

    setText(
        "deliveredCylinders",
        deliveredCylinders
    );

    setText(
        "failedPayments",
        failedPayments
    );

    setText(
        "customersOnHold",
        calculateCustomersOnHold()
    );

    setText(
        "totalReceived",
        money(
            totalReceived
        )
    );

    setText(
        "totalPendingAmount",
        money(
            totalPendingAmount
        )
    );

    setText(
        "monthReceived",
        money(
            monthReceived
        )
    );

    setText(
        "monthPending",
        money(
            0
        )
    );

    setText(
        "extraCharges",
        money(
            extraCharges
        )
    );

    setText(
        "monthTotal",
        money(
            monthReceived +
            extraCharges
        )
    );

    setText(
        "yearTotal",
        money(
            yearReceived
        )
    );

    setText(
        "currentYear",
        currentYear
    );

}


/* =========================================================
   CUSTOMERS ON HOLD
   ========================================================= */

function calculateCustomersOnHold(){

    const ids =
        new Set();

    agencyRequests.forEach(
        request => {

            const payment =
                getPaymentForRequest(
                    request
                );

            if(!payment){

                const userId =
                    getUserId(
                        request
                    );

                if(userId){
                    ids.add(
                        userId
                    );
                }

            }

        }
    );

    return ids.size;

}


/* =========================================================
   CUSTOMER DATA
   ========================================================= */

function buildCustomerRows(){

    const map =
        new Map();


    agencyRequests.forEach(
        request => {

            const userId =
                getUserId(
                    request
                );

            if(!userId){
                return;
            }

            if(!map.has(userId)){

                map.set(
                    userId,
                    {
                        profile:
                            findProfile(
                                userId
                            ),
                        requests:[],
                        payments:[],
                        cylinders:0
                    }
                );

            }

            const item =
                map.get(
                    userId
                );

            item.requests.push(
                request
            );

            const payment =
                getPaymentForRequest(
                    request
                );

            if(payment){

                item.payments.push(
                    payment
                );

            }

            item.cylinders +=
                numberValue(
                    valueOf(
                        request,
                        [
                            "cylinder_count",
                            "cylinders",
                            "quantity"
                        ],
                        1
                    )
                );

        }
    );


    return [
        ...map.values()
    ];

}


/* =========================================================
   CUSTOMER PAYMENT STATE
   ========================================================= */

function customerPaymentState(
    item
){

    if(
        !item ||
        !item.requests ||
        item.requests.length === 0
    ){

        return "pending";

    }


    const latest =
        [...item.requests]
        .sort(
            (
                a,
                b
            ) =>
                new Date(
                    dateValue(b)
                ) -
                new Date(
                    dateValue(a)
                )
        )[0];


    const payment =
        getPaymentForRequest(
            latest
        );


    if(payment){

        return "paid";

    }


    return "pending";

}


/* =========================================================
   PREVIOUS DUE
   ========================================================= */

function customerPreviousDue(
    item
){

    if(!item){
        return 0;
    }


    let due = 0;


    item.requests.forEach(
        request => {

            const payment =
                getPaymentForRequest(
                    request
                );

            if(!payment){

                due +=
                    numberValue(
                        valueOf(
                            request,
                            [
                                "previous_due",
                                "due_amount",
                                "amount",
                                "total_amount"
                            ],
                            0
                        )
                    );

            }

        }
    );


    return due;

}


/* =========================================================
   NEXT CYLINDER ELIGIBILITY
   ========================================================= */

function isCustomerEligible(
    item
){

    return (
        customerPreviousDue(
            item
        ) <= 0
    );

}


/* =========================================================
   RENDER CUSTOMERS
   ========================================================= */

function renderCustomers(){

    if(!customerTableBody){
        return;
    }


    const search =
        lower(
            searchInput
                ? searchInput.value
                : ""
        );

    const paymentFilterValue =
        lower(
            paymentFilter
                ? paymentFilter.value
                : ""
        );

    const requestFilterValue =
        lower(
            requestFilter
                ? requestFilter.value
                : ""
        );

    const monthFilterValue =
        monthFilter
            ? monthFilter.value
            : "";


    let rows =
        buildCustomerRows();


    rows =
        rows.filter(
            item => {

                const profile =
                    item.profile ||
                    {};

                const name =
                    valueOf(
                        profile,
                        [
                            "full_name",
                            "name",
                            "fullName"
                        ],
                        ""
                    );

                const mobile =
                    valueOf(
                        profile,
                        [
                            "mobile",
                            "phone",
                            "phone_number"
                        ],
                        ""
                    );

                const email =
                    valueOf(
                        profile,
                        [
                            "email"
                        ],
                        ""
                    );


                const customerId =
                    valueOf(
                        profile,
                        [
                            "customer_id",
                            "id"
                        ],
                        ""
                    );


                const requestNumbers =
                    item.requests
                    .map(
                        request =>
                            getRequestNumber(
                                request
                            )
                    )
                    .join(" ");


                const searchText =
                    lower(
                        [
                            name,
                            mobile,
                            email,
                            customerId,
                            requestNumbers
                        ].join(" ")
                    );


                if(
                    search &&
                    !searchText.includes(
                        search
                    )
                ){

                    return false;

                }


                if(
                    paymentFilterValue &&
                    customerPaymentState(
                        item
                    ) !==
                    paymentFilterValue
                ){

                    return false;

                }


                if(
                    requestFilterValue
                ){

                    const matched =
                        item.requests.some(
                            request =>
                                lower(
                                    requestStatus(
                                        request
                                    )
                                ) ===
                                requestFilterValue
                        );

                    if(!matched){
                        return false;
                    }

                }


                if(
                    monthFilterValue !== ""
                ){

                    const matched =
                        item.requests.some(
                            request => {

                                const date =
                                    new Date(
                                        dateValue(
                                            request
                                        )
                                    );

                                return (
                                    date.getMonth()
                                    ===
                                    Number(
                                        monthFilterValue
                                    )
                                );

                            }
                        );

                    if(!matched){
                        return false;
                    }

                }


                return true;

            }
        );


    if(rows.length === 0){

        customerTableBody.innerHTML =
            `
            <tr>
                <td colspan="10" class="empty">
                    No customer records found.
                </td>
            </tr>
            `;

        return;

    }


    customerTableBody.innerHTML =
        rows.map(
            item => {

                const profile =
                    item.profile ||
                    {};

                const name =
                    valueOf(
                        profile,
                        [
                            "full_name",
                            "name",
                            "fullName"
                        ],
                        "Customer"
                    );

                const mobile =
                    valueOf(
                        profile,
                        [
                            "mobile",
                            "phone",
                            "phone_number"
                        ],
                        "—"
                    );

                const email =
                    valueOf(
                        profile,
                        [
                            "email"
                        ],
                        "—"
                    );

                const customerId =
                    valueOf(
                        profile,
                        [
                            "customer_id",
                            "id"
                        ],
                        "—"
                    );

                const paymentState =
                    customerPaymentState(
                        item
                    );

                const due =
                    customerPreviousDue(
                        item
                    );

                const eligible =
                    isCustomerEligible(
                        item
                    );


                const latest =
                    [...item.requests]
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            new Date(
                                dateValue(b)
                            ) -
                            new Date(
                                dateValue(a)
                            )
                    )[0];


                const lastRequest =
                    latest
                        ? getRequestNumber(
                            latest
                        )
                        : "—";


                const photo =
                    valueOf(
                        profile,
                        [
                            "profile_photo",
                            "avatar_url",
                            "photo_url"
                        ],
                        ""
                    );


                const photoHtml =
                    photo
                        ?
                        `
                        <img
                            class="user-photo"
                            src="${escapeHtml(photo)}"
                            alt="Customer"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                        >
                        <div
                            class="user-photo-fallback"
                            style="display:none;"
                        >
                            👤
                        </div>
                        `
                        :
                        `
                        <div class="user-photo-fallback">
                            👤
                        </div>
                        `;


                return `
                    <tr
                        class="customer-row"
                        data-user-id="${escapeHtml(
                            getUserId(
                                latest
                            )
                        )}"
                        style="cursor:pointer;"
                    >

                        <td>
                            <div class="user-box">

                                ${photoHtml}

                                <div>
                                    <div class="user-name">
                                        ${escapeHtml(name)}
                                    </div>

                                    <div class="user-email">
                                        ${escapeHtml(email)}
                                    </div>
                                </div>

                            </div>
                        </td>

                        <td>
                            ${escapeHtml(mobile)}
                        </td>

                        <td>
                            ${escapeHtml(email)}
                        </td>

                        <td>
                            ${escapeHtml(customerId)}
                        </td>

                        <td>
                            ${item.requests.length}
                        </td>

                        <td>
                            ${item.cylinders}
                        </td>

                        <td>
                            <span class="badge ${
                                paymentState === "paid"
                                    ? "badge-green"
                                    : "badge-yellow"
                            }">
                                ${
                                    paymentState === "paid"
                                        ? "Paid"
                                        : "Pending"
                                }
                            </span>
                        </td>

                        <td class="money">
                            ${money(due)}
                        </td>

                        <td>
                            <span class="badge ${
                                eligible
                                    ? "badge-green"
                                    : "badge-red"
                            }">
                                ${
                                    eligible
                                        ? "Eligible"
                                        : "On Hold"
                                }
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(lastRequest)}
                        </td>

                    </tr>
                `;

            }
        ).join("");


    customerTableBody
        .querySelectorAll(
            ".customer-row"
        )
        .forEach(
            row => {

                row.addEventListener(
                    "click",
                    function(){

                        openCustomerModal(
                            this.dataset.userId
                        );

                    }
                );

            }
        );

}


/* =========================================================
   HOLD CUSTOMERS
   ========================================================= */

function renderHoldCustomers(){

    if(!holdTableBody){
        return;
    }


    const rows =
        buildCustomerRows()
        .filter(
            item =>
                customerPreviousDue(
                    item
                ) > 0
        );


    if(rows.length === 0){

        holdTableBody.innerHTML =
            `
            <tr>
                <td colspan="6" class="empty">
                    No customers are currently on hold.
                </td>
            </tr>
            `;

        return;

    }


    holdTableBody.innerHTML =
        rows.map(
            item => {

                const profile =
                    item.profile ||
                    {};

                const name =
                    valueOf(
                        profile,
                        [
                            "full_name",
                            "name"
                        ],
                        "Customer"
                    );

                const mobile =
                    valueOf(
                        profile,
                        [
                            "mobile",
                            "phone"
                        ],
                        "—"
                    );

                const due =
                    customerPreviousDue(
                        item
                    );

                const latest =
                    [...item.requests]
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            new Date(
                                dateValue(b)
                            ) -
                            new Date(
                                dateValue(a)
                            )
                    )[0];


                return `
                    <tr>

                        <td>
                            <strong>
                                ${escapeHtml(name)}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(mobile)}
                        </td>

                        <td class="money">
                            ${money(due)}
                        </td>

                        <td>
                            <span class="badge badge-red">
                                Payment Pending
                            </span>
                        </td>

                        <td>
                            <span class="badge badge-red">
                                On Hold
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(
                                latest
                                    ? getRequestNumber(
                                        latest
                                    )
                                    : "—"
                            )}
                        </td>

                    </tr>
                `;

            }
        ).join("");

}


/* =========================================================
   RECENT TRANSACTIONS
   ========================================================= */

function renderRecent(){

    if(!recentTableBody){
        return;
    }


    const requests =
        [...agencyRequests]
        .sort(
            (
                a,
                b
            ) =>
                new Date(
                    dateValue(b)
                ) -
                new Date(
                    dateValue(a)
                )
        )
        .slice(
            0,
            15
        );


    if(requests.length === 0){

        recentTableBody.innerHTML =
            `
            <tr>
                <td colspan="7" class="empty">
                    No recent activity.
                </td>
            </tr>
            `;

        return;

    }


    recentTableBody.innerHTML =
        requests.map(
            request => {

                const profile =
                    findProfile(
                        getUserId(
                            request
                        )
                    );

                const name =
                    valueOf(
                        profile,
                        [
                            "full_name",
                            "name"
                        ],
                        "Customer"
                    );

                const payment =
                    getPaymentForRequest(
                        request
                    );

                const paymentStatus =
                    payment
                        ? getPaymentStatus(
                            payment
                        )
                        : "pending";


                const delivery =
                    deliveryStatus(
                        request
                    );


                return `
                    <tr>

                        <td>
                            ${escapeHtml(
                                getRequestNumber(
                                    request
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(name)}
                        </td>

                        <td class="money">
                            ${money(
                                requestAmount(
                                    request
                                )
                            )}
                        </td>

                        <td>
                            <span class="badge ${
                                isApprovedPaymentStatus(
                                    paymentStatus
                                )
                                    ? "badge-green"
                                    : "badge-yellow"
                            }">
                                ${escapeHtml(
                                    paymentStatus
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="badge badge-blue">
                                ${escapeHtml(
                                    requestStatus(
                                        request
                                    )
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="badge ${
                                lower(delivery) ===
                                "delivered"
                                    ? "badge-green"
                                    : "badge-gray"
                            }">
                                ${escapeHtml(
                                    delivery
                                )}
                            </span>
                        </td>

                        <td>
                            ${formatDate(
                                dateValue(
                                    request
                                )
                            )}
                        </td>

                    </tr>
                `;

            }
        ).join("");

}


/* =========================================================
   MONTHLY SUMMARY
   ========================================================= */

function renderMonthlySummary(){

    if(!monthlySummary){
        return;
    }


    const currentYear =
        new Date()
        .getFullYear();


    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];


    monthlySummary.innerHTML =
        months.map(
            (
                month,
                index
            ) => {

                const total =
                    approvedPayments
                    .reduce(
                        (
                            sum,
                            payment
                        ) => {

                            const date =
                                new Date(
                                    dateValue(
                                        payment
                                    )
                                );

                            if(
                                date.getFullYear() ===
                                currentYear &&
                                date.getMonth() ===
                                index
                            ){

                                return sum +
                                    numberValue(
                                        valueOf(
                                            payment,
                                            [
                                                "amount",
                                                "paid_amount",
                                                "payment_amount"
                                            ],
                                            0
                                        )
                                    );

                            }

                            return sum;

                        },
                        0
                    );


                return `
                    <div class="simple-row">

                        <div class="simple-left">
                            ${month}
                        </div>

                        <div class="simple-right">
                            ${money(total)}
                        </div>

                    </div>
                `;

            }
        ).join("");

}


/* =========================================================
   YEARLY SUMMARY
   ========================================================= */

function renderYearlySummary(){

    if(!yearlySummary){
        return;
    }


    const currentYear =
        new Date()
        .getFullYear();


    const years = [
        currentYear - 2,
        currentYear - 1,
        currentYear
    ];


    yearlySummary.innerHTML =
        years.map(
            year => {

                const total =
                    approvedPayments
                    .reduce(
                        (
                            sum,
                            payment
                        ) => {

                            const date =
                                new Date(
                                    dateValue(
                                        payment
                                    )
                                );

                            if(
                                date.getFullYear() ===
                                year
                            ){

                                return sum +
                                    numberValue(
                                        valueOf(
                                            payment,
                                            [
                                                "amount",
                                                "paid_amount",
                                                "payment_amount"
                                            ],
                                            0
                                        )
                                    );

                            }

                            return sum;

                        },
                        0
                    );


                return `
                    <div class="simple-row">

                        <div class="simple-left">
                            ${year}
                        </div>

                        <div class="simple-right">
                            ${money(total)}
                        </div>

                    </div>
                `;

            }
        ).join("");

}


/* =========================================================
   CUSTOMER MODAL
   ========================================================= */

function openCustomerModal(
    userId
){

    if(!customerModal){
        return;
    }


    const profile =
        findProfile(
            userId
        );


    const requests =
        agencyRequests.filter(
            request =>
                getUserId(
                    request
                ) ===
                String(
                    userId
                )
        );


    const item = {
        profile:
            profile,
        requests:
            requests
    };


    const name =
        valueOf(
            profile,
            [
                "full_name",
                "name"
            ],
            "Customer"
        );

    const email =
        valueOf(
            profile,
            [
                "email"
            ],
            "—"
        );

    const mobile =
        valueOf(
            profile,
            [
                "mobile",
                "phone"
            ],
            "—"
        );

    const customerId =
        valueOf(
            profile,
            [
                "customer_id",
                "id"
            ],
            "—"
        );

    const address =
        valueOf(
            profile,
            [
                "address",
                "full_address",
                "city"
            ],
            "—"
        );

    const company =
        valueOf(
            profile,
            [
                "lpg_company",
                "company"
            ],
            valueOf(
                currentAgency,
                [
                    "lpg_company",
                    "company"
                ],
                "—"
            )
        );


    const cylinders =
        requests.reduce(
            (
                total,
                request
            ) =>
                total +
                numberValue(
                    valueOf(
                        request,
                        [
                            "cylinder_count",
                            "cylinders",
                            "quantity"
                        ],
                        1
                    )
                ),
            0
        );


    const due =
        customerPreviousDue(
            item
        );


    const latest =
        [...requests]
        .sort(
            (
                a,
                b
            ) =>
                new Date(
                    dateValue(b)
                ) -
                new Date(
                    dateValue(a)
                )
        )[0];


    const photo =
        valueOf(
            profile,
            [
                "profile_photo",
                "avatar_url",
                "photo_url"
            ],
            ""
        );


    if(
        $("customerModalName")
    ){

        $("customerModalName")
            .textContent =
            name;

    }

    if(
        $("customerModalEmail")
    ){

        $("customerModalEmail")
            .textContent =
            email;

    }

    if(
        $("detailCustomerId")
    ){

        $("detailCustomerId")
            .textContent =
            customerId;

    }

    if(
        $("detailMobile")
    ){

        $("detailMobile")
            .textContent =
            mobile;

    }

    if(
        $("detailAddress")
    ){

        $("detailAddress")
            .textContent =
            address;

    }

    if(
        $("detailCompany")
    ){

        $("detailCompany")
            .textContent =
            company;

    }

    if(
        $("detailRequests")
    ){

        $("detailRequests")
            .textContent =
            requests.length;

    }

    if(
        $("detailCylinders")
    ){

        $("detailCylinders")
            .textContent =
            cylinders;

    }

    if(
        $("detailDue")
    ){

        $("detailDue")
            .textContent =
            money(due);

    }

    if(
        $("detailPayment")
    ){

        $("detailPayment")
            .textContent =
            due > 0
                ? "Pending"
                : "Clear";

    }

    if(
        $("detailLastRequest")
    ){

        $("detailLastRequest")
            .textContent =
            latest
                ? getRequestNumber(
                    latest
                )
                : "—";

    }

    if(
        $("detailLastDelivery")
    ){

        $("detailLastDelivery")
            .textContent =
            latest
                ? deliveryStatus(
                    latest
                )
                : "—";

    }


    const customerPhoto =
        $("customerModalPhoto");

    if(customerPhoto){

        if(photo){

            customerPhoto.src =
                photo;

            customerPhoto.style.display =
                "block";

        }
        else{

            customerPhoto.removeAttribute(
                "src"
            );

            customerPhoto.style.display =
                "none";

        }

    }


    const eligibility =
        $("customerEligibility");

    const eligibilityText =
        $("customerEligibilityText");

    if(due > 0){

        if(eligibility){

            eligibility.textContent =
                "🔴 Next Cylinder: On Hold";

        }

        if(eligibilityText){

            eligibilityText.textContent =
                "Previous payment due is pending. Customer must clear the due amount.";

        }

    }
    else{

        if(eligibility){

            eligibility.textContent =
                "🟢 Next Cylinder: Eligible";

        }

        if(eligibilityText){

            eligibilityText.textContent =
                "Payment status is clear.";

        }

    }


    customerModal.classList.add(
        "show"
    );

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function notificationIcon(
    type
){

    const t =
        lower(type);

    if(
        t === "payment"
    ){

        return "💳";

    }

    if(
        t === "delivery"
    ){

        return "🚚";

    }

    if(
        t === "request"
    ){

        return "📊";

    }

    if(
        t === "system"
    ){

        return "⚙️";

    }

    return "🔔";

}


function notificationTime(
    value
){

    if(!value){
        return "";
    }

    const date =
        new Date(value);

    if(
        Number.isNaN(
            date.getTime()
        )
    ){

        return "";

    }

    return date.toLocaleString(
        "en-IN",
        {
            day:"2-digit",
            month:"short",
            hour:"2-digit",
            minute:"2-digit"
        }
    );

}


async function loadNotifications(){

    if(!currentUser){
        return false;
    }

    try{

        const {
            data,
            error
        } =
        await supabaseClient
        .from("notifications")
        .select("*")
        .eq(
            "user_id",
            currentUser.id
        )
        .order(
            "created_at",
            {
                ascending:false
            }
        )
        .limit(
            50
        );

        if(error){
            throw error;
        }

        notifications =
            Array.isArray(data)
                ? data
                : [];

        renderNotifications();

        return true;

    }
    catch(error){

        console.error(
            "Notification loading error:",
            error
        );

        notifications =
            [];

        renderNotifications();

        return false;

    }

}


/* =========================================================
   RENDER NOTIFICATIONS
   ========================================================= */

function renderNotifications(){

    if(!notificationList){
        return;
    }


    if(
        notifications.length === 0
    ){

        notificationList.innerHTML =
            `
            <div class="no-notifications">
                No new notifications.
            </div>
            `;

    }
    else{

        notificationList.innerHTML =
            notifications.map(
                notification => {

                    const title =
                        valueOf(
                            notification,
                            [
                                "title",
                                "notification_title"
                            ],
                            "Notification"
                        );

                    const text =
                        valueOf(
                            notification,
                            [
                                "message",
                                "text",
                                "description"
                            ],
                            ""
                        );

                    const type =
                        valueOf(
                            notification,
                            [
                                "type",
                                "notification_type"
                            ],
                            "system"
                        );

                    const read =
                        Boolean(
                            notification.is_read ??
                            notification.read ??
                            false
                        );

                    return `
                        <div
                            class="notification-item ${
                                read
                                    ? ""
                                    : "unread"
                            }"
                        >

                            <div class="notification-icon">
                                ${notificationIcon(type)}
                            </div>

                            <div class="notification-content">

                                <div class="notification-title">
                                    ${escapeHtml(title)}
                                </div>

                                <div class="notification-text">
                                    ${escapeHtml(text)}
                                </div>

                                <div class="notification-time">
                                    ${escapeHtml(
                                        notificationTime(
                                            notification.created_at
                                        )
                                    )}
                                </div>

                            </div>

                            ${
                                read
                                    ? ""
                                    :
                                    `
                                    <button
                                        type="button"
                                        class="notification-read"
                                        data-notification-id="${escapeHtml(
                                            notification.id
                                        )}"
                                    >
                                        Read
                                    </button>
                                    `
                            }

                        </div>
                    `;

                }
            ).join("");


        notificationList
            .querySelectorAll(
                ".notification-read"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        async function(event){

                            event.stopPropagation();

                            await markNotificationRead(
                                this.dataset.notificationId
                            );

                        }
                    );

                }
            );

    }


    const unread =
        notifications.filter(
            notification =>
                !Boolean(
                    notification.is_read ??
                    notification.read ??
                    false
                )
        ).length;


    if(notificationCount){

        notificationCount.textContent =
            unread;

        notificationCount.classList.toggle(
            "show",
            unread > 0
        );

    }


    if(sidebarNotificationCount){

        sidebarNotificationCount.textContent =
            unread;

        sidebarNotificationCount.classList.toggle(
            "show",
            unread > 0
        );

    }

}


/* =========================================================
   MARK ONE NOTIFICATION READ
   ========================================================= */

async function markNotificationRead(
    id
){

    if(!id){
        return;
    }

    try{

        const {
            error
        } =
        await supabaseClient
        .from("notifications")
        .update({
            is_read:true
        })
        .eq(
            "id",
            id
        );

        if(error){
            throw error;
        }

        await loadNotifications();

    }
    catch(error){

        console.error(
            "Mark notification error:",
            error
        );

    }

}


/* =========================================================
   MARK ALL READ
   ========================================================= */

async function markAllNotificationsRead(){

    if(!currentUser){
        return;
    }

    try{

        const {
            error
        } =
        await supabaseClient
        .from("notifications")
        .update({
            is_read:true
        })
        .eq(
            "user_id",
            currentUser.id
        )
        .eq(
            "is_read",
            false
        );

        if(error){
            throw error;
        }

        await loadNotifications();

    }
    catch(error){

        console.error(
            "Mark all notifications error:",
            error
        );

        showToast(
            "Notification Error",
            error.message ||
            "Unable to mark notifications as read."
        );

    }

}


/* =========================================================
   CREATE AGENCY NOTIFICATION
   ========================================================= */

async function createNotification(
    title,
    message,
    type
){

    if(!currentUser){
        return;
    }

    try{

        await supabaseClient
        .from("notifications")
        .insert({
            user_id:
                currentUser.id,
            title:
                title,
            message:
                message,
            type:
                type || "system",
            is_read:
                false
        });

    }
    catch(error){

        console.error(
            "Create notification error:",
            error
        );

    }

}


/* =========================================================
   NOTIFICATION REALTIME
   ========================================================= */

function startNotificationRealtime(){

    if(notificationChannel){

        supabaseClient.removeChannel(
            notificationChannel
        );

        notificationChannel =
            null;

    }


    if(!currentUser){
        return;
    }


    notificationChannel =
        supabaseClient
        .channel(
            "agency-notifications-" +
            String(
                currentUser.id
            )
        )
        .on(
            "postgres_changes",
            {
                event:"INSERT",
                schema:"public",
                table:"notifications",
                filter:
                    "user_id=eq." +
                    currentUser.id
            },
            async payload => {

                const notification =
                    payload.new ||
                    {};

                notifications.unshift(
                    notification
                );

                notifications =
                    notifications.slice(
                        0,
                        50
                    );

                renderNotifications();

                playNotificationSound();

                showToast(
                    valueOf(
                        notification,
                        [
                            "title"
                        ],
                        "New Notification"
                    ),
                    valueOf(
                        notification,
                        [
                            "message"
                        ],
                        "You have a new notification."
                    )
                );

            }
        )
        .subscribe(
            status => {

                console.log(
                    "Agency notification realtime:",
                    status
                );

            }
        );

}


/* =========================================================
   CYLINDER REQUEST REALTIME
   ========================================================= */

function startRealtime(){

    if(realtimeChannel){

        supabaseClient.removeChannel(
            realtimeChannel
        );

        realtimeChannel =
            null;

    }


    if(!agencyId){
        return;
    }


    realtimeChannel =
        supabaseClient
        .channel(
            "agency-cylinder-requests-" +
            String(
                agencyId
            )
        );


    realtimeChannel.on(
        "postgres_changes",
        {
            event:"INSERT",
            schema:"public",
            table:"cylinder_requests",
            filter:
                "agency_id=eq." +
                agencyId
        },
        async payload => {

            await refreshDashboard(
                false
            );

            const row =
                payload.new ||
                {};

            showToast(
                "New Cylinder Request",
                "A new approved-payment cylinder request is available."
            );

            playNotificationSound();

        }
    );


    realtimeChannel.on(
        "postgres_changes",
        {
            event:"UPDATE",
            schema:"public",
            table:"cylinder_requests",
            filter:
                "agency_id=eq." +
                agencyId
        },
        async payload => {

            const oldRow =
                payload.old ||
                {};

            const newRow =
                payload.new ||
                {};


            await refreshDashboard(
                false
            );


            const oldDelivery =
                lower(
                    oldRow.delivery_status
                );

            const newDelivery =
                lower(
                    newRow.delivery_status
                );

            const oldStatus =
                lower(
                    oldRow.status
                );

            const newStatus =
                lower(
                    newRow.status
                );

            const requestNumber =
                newRow.request_number ||
                "Cylinder request";


            if(
                oldDelivery !==
                newDelivery
            ){

                await createNotification(
                    "🚚 Delivery Status Updated",
                    "Delivery status for " +
                    requestNumber +
                    " changed to " +
                    (
                        newDelivery ||
                        "pending"
                    ) +
                    ".",
                    "delivery"
                );

            }
            else if(
                oldStatus !==
                newStatus
            ){

                await createNotification(
                    "🔔 Request Status Updated",
                    "Request " +
                    requestNumber +
                    " status changed to " +
                    (
                        newStatus ||
                        "pending"
                    ) +
                    ".",
                    "request"
                );

            }

        }
    );


    realtimeChannel.subscribe(
        status => {

            console.log(
                "Agency request realtime:",
                status
            );

        }
    );

}


/* =========================================================
   PAYMENT REALTIME
   ========================================================= */

function startPaymentRealtime(){

    if(paymentRealtimeChannel){

        supabaseClient.removeChannel(
            paymentRealtimeChannel
        );

        paymentRealtimeChannel =
            null;

    }


    if(!agencyId){
        return;
    }


    paymentRealtimeChannel =
        supabaseClient
        .channel(
            "agency-approved-payments-" +
            String(
                agencyId
            )
        );


    paymentRealtimeChannel.on(
        "postgres_changes",
        {
            event:"INSERT",
            schema:"public",
            table:"payments"
        },
        async payload => {

            const row =
                payload.new ||
                {};

            const oldCount =
                approvedPayments.length;


            await refreshDashboard(
                false
            );


            const nowApproved =
                approvedPayments.some(
                    payment =>
                        String(
                            payment.id
                        ) ===
                        String(
                            row.id
                        )
                );


            if(
                nowApproved &&
                approvedPayments.length >=
                oldCount
            ){

                playNotificationSound();

                showToast(
                    "Payment Approved",
                    "A new Owner-approved cylinder request is available."
                );

            }

        }
    );


    paymentRealtimeChannel.on(
        "postgres_changes",
        {
            event:"UPDATE",
            schema:"public",
            table:"payments"
        },
        async payload => {

            const oldRow =
                payload.old ||
                {};

            const newRow =
                payload.new ||
                {};


            const oldStatus =
                lower(
                    oldRow.status
                );

            const newStatus =
                lower(
                    newRow.status
                );


            await refreshDashboard(
                false
            );


            if(
                !isApprovedPaymentStatus(
                    oldStatus
                ) &&
                isApprovedPaymentStatus(
                    newStatus
                )
            ){

                playNotificationSound();

                showToast(
                    "Payment Approved",
                    "Owner has approved a payment. The related cylinder request is now available."
                );

            }


            if(
                isApprovedPaymentStatus(
                    oldStatus
                ) &&
                (
                    newStatus ===
                    "rejected" ||
                    newStatus ===
                    "failed"
                )
            ){

                showToast(
                    "Payment Status Changed",
                    "An approved payment is no longer approved."
                );

            }

        }
    );


    paymentRealtimeChannel.subscribe(
        status => {

            console.log(
                "Agency payment realtime:",
                status
            );

        }
    );

}


/* =========================================================
   REFRESH DASHBOARD
   ========================================================= */

async function refreshDashboard(
    showMessageAfter
){

    if(
        !currentUser ||
        !agencyId
    ){

        return;

    }


    const paymentOk =
        await loadApprovedPayments();


    if(!paymentOk){

        if(customerTableBody){

            customerTableBody.innerHTML =
                `
                <tr>
                    <td colspan="10" class="empty">
                        Unable to verify Owner-approved payments.
                    </td>
                </tr>
                `;

        }

        return;

    }


    const requestOk =
        await loadRequests();


    if(!requestOk){
        return;
    }


    await loadCustomers();

    updateCounters();

    renderCustomers();

    renderHoldCustomers();

    renderRecent();

    renderMonthlySummary();

    renderYearlySummary();


    if(showMessageAfter){

        showToast(
            "Data Refreshed",
            "Agency dashboard data has been updated."
        );

    }

}


/* =========================================================
   SIDEBAR NAVIGATION
   IMPORTANT:
   DOES NOT DEPEND ON DUPLICATE IDs
   ========================================================= */

const agencyRoutes = {

    "dashboard":
        "agency-dashboard.html",

    "customers":
        "agency-customers.html",

    "cylinder requests":
        "agency-cylinder-requests.html",

    "request details":
        "agency-cylinder-requests.html",

    "request processing":
        "agency-cylinder-requests.html",

    "payments":
        "agency-payments.html",

    "repayments":
        "agency-payments.html",

    "deliveries":
        "agency-deliveries.html",

    "pending / on hold":
        "agency-pending.html",

    "request / payment slips":
        "agency-slips.html",

    "notifications":
        "agency-notifications.html",

    "reports":
        "agency-reports.html",

    "settings":
        "agency-settings.html",

    "about":
        "agency-about.html"

};


function normalizeNavText(
    text
){

    return String(
        text || ""
    )
    .replace(
        /\s+/g,
        " "
    )
    .trim()
    .toLowerCase();

}


function closeSidebar(){

    if(sidebar){

        sidebar.classList.remove(
            "open"
        );

    }

    if(overlay){

        overlay.classList.remove(
            "show"
        );

    }

}


function openAgencyPage(
    page
){

    closeSidebar();

    if(page){

        window.location.href =
            page;

    }

}


/*
   FIX FOR ALL SIDEBAR BUTTONS

   We intentionally use .nav-btn + visible text
   instead of element IDs because the supplied HTML
   contains duplicate IDs.
*/

document
.querySelectorAll(
    ".sidebar .nav-btn"
)
.forEach(
    button => {

        button.addEventListener(
            "click",
            function(event){

                event.preventDefault();

                const text =
                    normalizeNavText(
                        this.textContent
                    );


                if(
                    text ===
                    "logout"
                ){

                    closeSidebar();

                    if(logoutModal){

                        logoutModal.classList.add(
                            "show"
                        );

                    }

                    return;

                }


                const route =
                    agencyRoutes[
                        text
                    ];


                if(route){

                    openAgencyPage(
                        route
                    );

                }
                else{

                    console.warn(
                        "No route defined for sidebar button:",
                        text
                    );

                }

            }
        );

    }
);


/* =========================================================
   MOBILE SIDEBAR
   ========================================================= */

if(menuBtn){

    menuBtn.addEventListener(
        "click",
        function(event){

            event.stopPropagation();

            if(sidebar){

                sidebar.classList.toggle(
                    "open"
                );

            }

            if(overlay){

                overlay.classList.toggle(
                    "show"
                );

            }

        }
    );

}


if(overlay){

    overlay.addEventListener(
        "click",
        function(){

            closeSidebar();

        }
    );

}


/* =========================================================
   NOTIFICATION BUTTON
   ========================================================= */

if(notificationBtn){

    notificationBtn.addEventListener(
        "click",
        function(event){

            event.stopPropagation();

            if(notificationPanel){

                notificationPanel.classList.toggle(
                    "show"
                );

            }

        }
    );

}


if(notificationPanel){

    notificationPanel.addEventListener(
        "click",
        function(event){

            event.stopPropagation();

        }
    );

}


document.addEventListener(
    "click",
    function(){

        if(notificationPanel){

            notificationPanel.classList.remove(
                "show"
            );

        }

    }
);


if(markAllRead){

    markAllRead.addEventListener(
        "click",
        function(event){

            event.stopPropagation();

            markAllNotificationsRead();

        }
    );

}


/* =========================================================
   SETTINGS / PASSWORD RESET
   ========================================================= */

if(resetPasswordBtn){

    resetPasswordBtn.addEventListener(
        "click",
        async function(){

            const email =
                currentUser &&
                currentUser.email;


            if(!email){

                if(settingsMessage){

                    settingsMessage.style.display =
                        "block";

                    settingsMessage.style.background =
                        "#fff0f0";

                    settingsMessage.style.color =
                        "#c33232";

                    settingsMessage.textContent =
                        "Registered agency email was not found.";

                }

                return;

            }


            resetPasswordBtn.disabled =
                true;

            resetPasswordBtn.textContent =
                "Sending...";


            if(settingsMessage){

                settingsMessage.style.display =
                    "none";

            }


            try{

                const {
                    error
                } =
                await supabaseClient
                .auth
                .resetPasswordForEmail(
                    email,
                    {
                        redirectTo:
                            window.location.origin +
                            "/agency-reset-password.html"
                    }
                );


                if(error){
                    throw error;
                }


                if(settingsMessage){

                    settingsMessage.style.display =
                        "block";

                    settingsMessage.style.background =
                        "#eaf9ef";

                    settingsMessage.style.color =
                        "#18763a";

                    settingsMessage.textContent =
                        "Password reset link has been sent to your registered agency email.";

                }

            }
            catch(error){

                console.error(
                    error
                );


                if(settingsMessage){

                    settingsMessage.style.display =
                        "block";

                    settingsMessage.style.background =
                        "#fff0f0";

                    settingsMessage.style.color =
                        "#c33232";

                    settingsMessage.textContent =
                        error.message ||
                        "Unable to send password reset link.";

                }

            }
            finally{

                resetPasswordBtn.disabled =
                    false;

                resetPasswordBtn.textContent =
                    "🔐 Send Password Reset Link";

            }

        }
    );

}


if(settingsClose){

    settingsClose.addEventListener(
        "click",
        function(){

            if(settingsModal){

                settingsModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


/* =========================================================
   MODALS
   ========================================================= */

if(customerClose){

    customerClose.addEventListener(
        "click",
        function(){

            if(customerModal){

                customerModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


if(customerModal){

    customerModal.addEventListener(
        "click",
        function(event){

            if(
                event.target ===
                customerModal
            ){

                customerModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


if(settingsModal){

    settingsModal.addEventListener(
        "click",
        function(event){

            if(
                event.target ===
                settingsModal
            ){

                settingsModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


/* =========================================================
   LOGOUT
   ========================================================= */

if(logoutBtn){

    /*
       The actual sidebar logout is already handled
       by the text-based navigation above.

       This listener is kept only as a safety fallback.
    */

    logoutBtn.addEventListener(
        "click",
        function(){

            closeSidebar();

            if(logoutModal){

                logoutModal.classList.add(
                    "show"
                );

            }

        }
    );

}


if(logoutCancel){

    logoutCancel.addEventListener(
        "click",
        function(){

            if(logoutModal){

                logoutModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


if(logoutModal){

    logoutModal.addEventListener(
        "click",
        function(event){

            if(
                event.target ===
                logoutModal
            ){

                logoutModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


if(logoutConfirm){

    logoutConfirm.addEventListener(
        "click",
        async function(){

            logoutConfirm.disabled =
                true;

            logoutConfirm.textContent =
                "Logging out...";


            try{

                if(realtimeChannel){

                    await supabaseClient
                    .removeChannel(
                        realtimeChannel
                    );

                    realtimeChannel =
                        null;

                }


                if(notificationChannel){

                    await supabaseClient
                    .removeChannel(
                        notificationChannel
                    );

                    notificationChannel =
                        null;

                }


                if(paymentRealtimeChannel){

                    await supabaseClient
                    .removeChannel(
                        paymentRealtimeChannel
                    );

                    paymentRealtimeChannel =
                        null;

                }


                await supabaseClient
                    .auth
                    .signOut();


                window.location.replace(
                    "agency-login.html"
                );

            }
            catch(error){

                console.error(
                    error
                );

                logoutConfirm.disabled =
                    false;

                logoutConfirm.textContent =
                    "Logout";

                showToast(
                    "Logout Failed",
                    "Please try again."
                );

            }

        }
    );

}


/* =========================================================
   SEARCH / FILTERS
   ========================================================= */

if(searchInput){

    searchInput.addEventListener(
        "input",
        renderCustomers
    );

}


if(paymentFilter){

    paymentFilter.addEventListener(
        "change",
        renderCustomers
    );

}


if(requestFilter){

    requestFilter.addEventListener(
        "change",
        renderCustomers
    );

}


if(monthFilter){

    monthFilter.addEventListener(
        "change",
        renderCustomers
    );

}


/* =========================================================
   ESC KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    function(event){

        if(
            event.key ===
            "Escape"
        ){

            if(customerModal){

                customerModal.classList.remove(
                    "show"
                );

            }

            if(settingsModal){

                settingsModal.classList.remove(
                    "show"
                );

            }

            if(notificationPanel){

                notificationPanel.classList.remove(
                    "show"
                );

            }

            if(logoutModal){

                logoutModal.classList.remove(
                    "show"
                );

            }

            closeSidebar();

        }

    }
);


/* =========================================================
   AUTH STATE
   ========================================================= */

supabaseClient
.auth
.onAuthStateChange(
    function(
        event,
        session
    ){

        if(
            event ===
            "SIGNED_OUT"
        ){

            window.location.replace(
                "agency-login.html"
            );

        }

    }
);


/* =========================================================
   PULL DOWN REFRESH
   ========================================================= */

let pullStartY =
    0;

let pullCurrentY =
    0;

let pullDistance =
    0;

let pullRefreshing =
    false;

let pullTracking =
    false;

const PULL_START =
    80;

const PULL_READY =
    130;

const PULL_MAX =
    180;


/* =========================================================
   PULL INDICATOR
   ========================================================= */

let pullRefreshIndicator =
    document.getElementById(
        "pullRefreshIndicator"
    );


if(!pullRefreshIndicator){

    pullRefreshIndicator =
        document.createElement(
            "div"
        );

    pullRefreshIndicator.id =
        "pullRefreshIndicator";

    pullRefreshIndicator.innerHTML =
        `
        <div class="pull-refresh-arrow">
            ↓
        </div>

        <div class="pull-refresh-text">
            Pull to Refresh
        </div>
        `;

    document.body.appendChild(
        pullRefreshIndicator
    );

}


/* =========================================================
   PULL REFRESH STYLE
   ========================================================= */

if(
    !document.getElementById(
        "pullRefreshStyle"
    )
){

    const pullStyle =
        document.createElement(
            "style"
        );

    pullStyle.id =
        "pullRefreshStyle";

    pullStyle.textContent =
        `
        #pullRefreshIndicator{

            position:fixed;

            top:0;
            left:50%;

            transform:
                translate(-50%,-100%);

            width:190px;

            min-height:48px;

            padding:9px 16px;

            box-sizing:border-box;

            display:flex;

            align-items:center;

            justify-content:center;

            gap:9px;

            background:
                rgba(255,255,255,.97);

            border:
                1px solid #d9e8f4;

            border-top:none;

            border-radius:
                0 0 18px 18px;

            box-shadow:
                0 5px 20px rgba(0,0,0,.10);

            color:#003e81;

            font-size:14px;

            font-weight:700;

            z-index:999999;

            opacity:0;

            pointer-events:none;

            transition:
                transform .18s ease,
                opacity .18s ease;
        }

        #pullRefreshIndicator.show{

            opacity:1;

        }

        #pullRefreshIndicator.ready{

            background:#eef8ff;

            color:#0066b3;

        }

        #pullRefreshIndicator.refreshing{

            background:#f4fff7;

            color:#168044;

        }

        .pull-refresh-arrow{

            width:25px;

            height:25px;

            display:flex;

            align-items:center;

            justify-content:center;

            font-size:21px;

            line-height:1;

            transition:
                transform .18s ease;
        }

        #pullRefreshIndicator.ready
        .pull-refresh-arrow{

            transform:
                rotate(180deg);

        }

        #pullRefreshIndicator.refreshing
        .pull-refresh-arrow{

            animation:
                pullRefreshSpin
                .8s linear infinite;

        }

        @keyframes pullRefreshSpin{

            from{
                transform:
                    rotate(0deg);
            }

            to{
                transform:
                    rotate(360deg);
            }

        }

        body.pull-refreshing{

            overflow-x:hidden;

        }
        `;

    document.head.appendChild(
        pullStyle
    );

}


/* =========================================================
   UPDATE PULL INDICATOR
   ========================================================= */

function updatePullIndicator(
    distance
){

    if(!pullRefreshIndicator){
        return;
    }


    if(pullRefreshing){

        pullRefreshIndicator.classList.add(
            "show"
        );

        pullRefreshIndicator.classList.remove(
            "ready"
        );

        pullRefreshIndicator.classList.add(
            "refreshing"
        );

        pullRefreshIndicator.style.transform =
            "translate(-50%,0)";


        const arrow =
            pullRefreshIndicator
            .querySelector(
                ".pull-refresh-arrow"
            );

        const text =
            pullRefreshIndicator
            .querySelector(
                ".pull-refresh-text"
            );


        if(arrow){

            arrow.textContent =
                "↻";

        }

        if(text){

            text.textContent =
                "Refreshing...";

        }

        return;

    }


    if(distance <= 0){

        pullRefreshIndicator.classList.remove(
            "show",
            "ready",
            "refreshing"
        );

        pullRefreshIndicator.style.transform =
            "translate(-50%,-100%)";

        return;

    }


    const progress =
        Math.min(
            distance /
            PULL_READY,
            1
        );


    const translateY =
        -100 +
        (
            progress *
            100
        );


    pullRefreshIndicator.style.transform =
        `translate(-50%,${translateY}%)`;


    pullRefreshIndicator.classList.add(
        "show"
    );

    pullRefreshIndicator.classList.remove(
        "refreshing"
    );


    const arrow =
        pullRefreshIndicator
        .querySelector(
            ".pull-refresh-arrow"
        );

    const text =
        pullRefreshIndicator
        .querySelector(
            ".pull-refresh-text"
        );


    if(
        distance >=
        PULL_READY
    ){

        pullRefreshIndicator.classList.add(
            "ready"
        );

        if(arrow){

            arrow.textContent =
                "↑";

        }

        if(text){

            text.textContent =
                "Release to Refresh";

        }

    }
    else{

        pullRefreshIndicator.classList.remove(
            "ready"
        );

        if(arrow){

            arrow.textContent =
                "↓";

        }

        if(text){

            text.textContent =
                "Pull to Refresh";

        }

    }

}


/* =========================================================
   TOUCH START
   ========================================================= */

document.addEventListener(
    "touchstart",
    function(event){

        if(
            pullRefreshing ||
            !event.touches ||
            event.touches.length !== 1
        ){

            return;

        }


        if(
            window.scrollY <=
            2
        ){

            pullTracking =
                true;

            pullStartY =
                event.touches[0]
                .clientY;

            pullCurrentY =
                pullStartY;

            pullDistance =
                0;

        }
        else{

            pullTracking =
                false;

        }

    },
    {
        passive:true
    }
);


/* =========================================================
   TOUCH MOVE
   ========================================================= */

document.addEventListener(
    "touchmove",
    function(event){

        if(
            pullRefreshing ||
            !pullTracking ||
            !event.touches ||
            event.touches.length !== 1
        ){

            return;

        }


        if(
            window.scrollY >
            2
        ){

            pullTracking =
                false;

            updatePullIndicator(
                0
            );

            return;

        }


        pullCurrentY =
            event.touches[0]
            .clientY;


        pullDistance =
            pullCurrentY -
            pullStartY;


        if(
            pullDistance <=
            0
        ){

            updatePullIndicator(
                0
            );

            return;

        }


        const visualDistance =
            Math.min(
                pullDistance,
                PULL_MAX
            );


        updatePullIndicator(
            visualDistance
        );

    },
    {
        passive:true
    }
);


/* =========================================================
   TOUCH END
   ========================================================= */

document.addEventListener(
    "touchend",
    async function(){

        if(!pullTracking){
            return;
        }


        pullTracking =
            false;


        const distance =
            pullDistance;


        pullStartY =
            0;

        pullCurrentY =
            0;

        pullDistance =
            0;


        if(
            distance <
            PULL_READY
        ){

            updatePullIndicator(
                0
            );

            return;

        }


        if(pullRefreshing){
            return;
        }


        pullRefreshing =
            true;


        document.body.classList.add(
            "pull-refreshing"
        );


        updatePullIndicator(
            PULL_READY
        );


        try{

            showToast(
                "Refreshing",
                "Checking Owner-approved payments and dashboard data..."
            );


            await refreshDashboard(
                false
            );


            await loadNotifications();


            const text =
                pullRefreshIndicator
                .querySelector(
                    ".pull-refresh-text"
                );

            const arrow =
                pullRefreshIndicator
                .querySelector(
                    ".pull-refresh-arrow"
                );


            pullRefreshIndicator
                .classList.remove(
                    "refreshing"
                );

            pullRefreshIndicator
                .classList.add(
                    "ready"
                );


            if(arrow){

                arrow.textContent =
                    "✓";

            }


            if(text){

                text.textContent =
                    "Data Refreshed";

            }


            showToast(
                "Data Refreshed",
                "Owner-approved requests and dashboard data have been updated."
            );


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        800
                    )
            );

        }
        catch(error){

            console.error(
                "Pull refresh error:",
                error
            );


            const text =
                pullRefreshIndicator
                .querySelector(
                    ".pull-refresh-text"
                );

            const arrow =
                pullRefreshIndicator
                .querySelector(
                    ".pull-refresh-arrow"
                );


            pullRefreshIndicator
                .classList.remove(
                    "refreshing",
                    "ready"
                );


            if(arrow){

                arrow.textContent =
                    "!";

            }


            if(text){

                text.textContent =
                    "Refresh Failed";

            }


            showToast(
                "Refresh Failed",
                "Unable to refresh dashboard data."
            );


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1000
                    )
            );

        }
        finally{

            pullRefreshing =
                false;

            document.body.classList.remove(
                "pull-refreshing"
            );

            updatePullIndicator(
                0
            );

        }

    },
    {
        passive:true
    }
);


/* =========================================================
   TOUCH CANCEL
   ========================================================= */

document.addEventListener(
    "touchcancel",
    function(){

        pullTracking =
            false;

        pullStartY =
            0;

        pullCurrentY =
            0;

        pullDistance =
            0;


        if(!pullRefreshing){

            updatePullIndicator(
                0
            );

        }

    },
    {
        passive:true
    }
);


/* =========================================================
   INITIALIZE
   ========================================================= */

async function init(){

    const sessionOk =
        await checkSession();


    if(!sessionOk){
        return;
    }


    const profileOk =
        await loadCurrentProfile();


    if(!profileOk){
        return;
    }


    const agencyOk =
        await loadAgency();


    if(!agencyOk){
        return;
    }


    await loadNotifications();


    await refreshDashboard(
        false
    );


    startRealtime();


    startNotificationRealtime();


    startPaymentRealtime();


    console.log(
        "EGC Agency Dashboard initialized successfully."
    );

}


/* =========================================================
   START
   ========================================================= */

init();