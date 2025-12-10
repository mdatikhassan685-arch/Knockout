const translations = {
    en: {
        login_title: "Login to your account",
        email_ph: "Enter Email",
        pass_ph: "Enter Password",
        login_btn: "Login",
        signup_link: "Create New Account",
        loading: "Loading...",
        success: "Login Successful!",
        error: "Invalid Email or Password",
        lang_sel: "Language"
    },
    bn: {
        login_title: "আপনার একাউন্ট লগইন করুন",
        email_ph: "ইমেইল দিন",
        pass_ph: "পাসওয়ার্ড দিন",
        login_btn: "লগইন",
        signup_link: "নতুন একাউন্ট খুলুন",
        loading: "অপেক্ষা করুন...",
        success: "লগইন সফল!",
        error: "ভুল ইমেইল বা পাসওয়ার্ড",
        lang_sel: "ভাষা"
    }
};

// ভাষা লোড করা
function loadLanguage() {
    const lang = localStorage.getItem('appLang') || 'bn'; // ডিফল্ট বাংলা
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

    // ড্রপডাউন ভ্যালু সেট করা
    const selector = document.getElementById('langSelect');
    if(selector) selector.value = lang;
}

// ভাষা পরিবর্তন করা
function changeLanguage(lang) {
    localStorage.setItem('appLang', lang);
    loadLanguage();
}

// পেজ লোড হলে ভাষা সেট হবে
document.addEventListener('DOMContentLoaded', loadLanguage);
