const translations = {
    en: {
        // ... (Old keys kept implicitly, showing updates mainly)
        login_title: "Login to your account",
        email_ph: "Enter Email",
        pass_ph: "Enter Password",
        login_btn: "Login",
        signup_link: "Create New Account",
        signup_title: "Create New Account",
        name_ph: "Full Name",
        phone_ph: "Mobile Number",
        register_btn: "Register",
        login_link_text: "Already have an account? Login",
        welcome: "Welcome",
        balance_lbl: "Balance",
        logout_btn: "Logout",
        tour_title: "🔥 Live Tournaments 🔥",
        coming_soon: "Matches coming soon...",
        
        // WALLET NEW KEYS
        wallet_title: "My Wallet",
        add_money: "Add Money",
        withdraw: "Withdraw",
        history: "History",
        amount_ph: "Amount (Tk)",
        method_lbl: "Payment Method",
        send_num_ph: "Sender Number",
        trx_ph: "Transaction ID",
        deposit_btn: "Verify Deposit",
        bkash_inst: "Send Money to this Personal Number",
        
        // Common
        loading: "Loading...",
        success: "Success!",
        error: "Error occurred",
        fill_all: "Please fill all fields",
        req_sent: "Request Sent! Wait for approval."
    },
    bn: {
        login_title: "আপনার একাউন্ট লগইন করুন",
        email_ph: "ইমেইল দিন",
        pass_ph: "পাসওয়ার্ড দিন",
        login_btn: "লগইন",
        signup_link: "নতুন একাউন্ট খুলুন",
        signup_title: "নতুন একাউন্ট খুলুন",
        name_ph: "আপনার নাম",
        phone_ph: "মোবাইল নম্বর",
        register_btn: "রেজিস্টার করুন",
        login_link_text: "আগেই একাউন্ট আছে? লগইন করুন",
        welcome: "স্বাগতম",
        balance_lbl: "ব্যালেন্স",
        logout_btn: "লগআউট",
        tour_title: "🔥 টুর্নামেন্ট চলছে 🔥",
        coming_soon: "ম্যাচ শীঘ্রই আসছে...",
        
        // WALLET NEW KEYS
        wallet_title: "আমার ওয়ালেট",
        add_money: "টাকা জমা দিন",
        withdraw: "টাকা তুলুন",
        history: "লেনদেন",
        amount_ph: "টাকার পরিমাণ",
        method_lbl: "পেমেন্ট মেথড",
        send_num_ph: "যে নাম্বার থেকে পাঠিয়েছেন",
        trx_ph: "ট্রানজেকশন আইডি (TrxID)",
        deposit_btn: "জমা নিশ্চিত করুন",
        bkash_inst: "এই পার্সোনাল নাম্বারে 'Send Money' করুন",

        // Common
        loading: "অপেক্ষা করুন...",
        success: "সফল!",
        error: "সমস্যা হয়েছে",
        fill_all: "সব ঘর পূরণ করতে হবে!",
        req_sent: "রিকুয়েস্ট পাঠানো হয়েছে! এডমিন চেক করবে।"
    }
};

function loadLanguage() {
    const lang = localStorage.getItem('appLang') || 'bn';
    const elements = document.querySelectorAll('[data-key]');
    
    elements.forEach(el => {
        const key = el.getAttribute('data-key');
        if (translations[lang][key]) {
            if (el.tagName === 'INPUT') {
                el.placeholder = translations[lang][key];
            } else {
                el.innerText = translations[lang][key];
            }
        }
    });
    
    // Dynamic Dropdown update
    const selector = document.getElementById('langSelect');
    if(selector) selector.value = lang;
}

function changeLanguage(lang) {
    localStorage.setItem('appLang', lang);
    loadLanguage();
}

document.addEventListener('DOMContentLoaded', loadLanguage);
