const translations = {
    en: {
        // Login Page
        login_title: "Login to your account",
        email_ph: "Enter Email",
        pass_ph: "Enter Password",
        login_btn: "Login",
        signup_link: "Create New Account",
        
        // Signup Page
        signup_title: "Create New Account",
        name_ph: "Full Name",
        phone_ph: "Mobile Number",
        register_btn: "Register",
        login_link_text: "Already have an account? Login",
        
        // Home Page
        welcome: "Welcome",
        balance_lbl: "Balance",
        logout_btn: "Logout",
        tour_title: "🔥 Live Tournaments 🔥",
        coming_soon: "Matches coming soon...",
        
        // Common
        loading: "Loading...",
        success: "Success!",
        error: "Error occurred",
        fill_all: "Please fill all fields"
    },
    bn: {
        // Login Page
        login_title: "আপনার একাউন্ট লগইন করুন",
        email_ph: "ইমেইল দিন",
        pass_ph: "পাসওয়ার্ড দিন",
        login_btn: "লগইন",
        signup_link: "নতুন একাউন্ট খুলুন",
        
        // Signup Page
        signup_title: "নতুন একাউন্ট খুলুন",
        name_ph: "আপনার নাম",
        phone_ph: "মোবাইল নম্বর",
        register_btn: "রেজিস্টার করুন",
        login_link_text: "আগেই একাউন্ট আছে? লগইন করুন",
        
        // Home Page
        welcome: "স্বাগতম",
        balance_lbl: "ব্যালেন্স",
        logout_btn: "লগআউট",
        tour_title: "🔥 টুর্নামেন্ট চলছে 🔥",
        coming_soon: "ম্যাচ শীঘ্রই আসছে...",
        
        // Common
        loading: "অপেক্ষা করুন...",
        success: "সফল!",
        error: "সমস্যা হয়েছে",
        fill_all: "সব ঘর পূরণ করতে হবে!"
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

    const selector = document.getElementById('langSelect');
    if(selector) selector.value = lang;
}

function changeLanguage(lang) {
    localStorage.setItem('appLang', lang);
    loadLanguage();
}

document.addEventListener('DOMContentLoaded', loadLanguage);
