document.addEventListener('DOMContentLoaded', () => {
    console.log('TBR Exchange JavaScript is working successfully!');
    
    // ለአዝራሮቹ መጫን (Click) የሚሆን ሙከራ
    const buttons = document.querySelectorAll('button, a.btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log('Button clicked:', e.target.innerText);
        });
    });

    // P2P Calculator Logic
    const calcInput = document.getElementById('calc-amount');
    const calcResult = document.getElementById('calc-result');
    const tabBuy = document.getElementById('tab-buy');
    const tabSell = document.getElementById('tab-sell');
    const payLabel = document.getElementById('pay-label');
    const receiveLabel = document.getElementById('receive-label');
    const payUnit = document.getElementById('pay-unit');

    let currentMode = 'sell';
    const rate = 189.00;

    function calculate() {
        if (!calcInput || !calcResult) return;
        const amount = parseFloat(calcInput.value) || 0;
        const receiveUnitText = currentMode === 'sell' ? 'ETB' : 'USDT';
        let result = 0;

        if (currentMode === 'sell') {
            result = amount * rate;
        } else {
            result = amount / rate;
        }

        calcResult.innerHTML = `${result.toFixed(2)} <span style="font-size: 12px; color: #777; font-weight: normal;">${receiveUnitText}</span>`;
    }

    window.setMode = function(mode) {
        currentMode = mode;
        if (!tabBuy || !tabSell || !payLabel || !receiveLabel || !payUnit || !calcInput) return;

        if (mode === 'buy') {
            tabBuy.classList.add('active');
            tabSell.classList.remove('active');
            payLabel.innerText = "PAY (ETB)";
            receiveLabel.innerText = "RECEIVE (USDT)";
            payUnit.innerText = "ETB";
            calcInput.value = "982.80";
        } else {
            tabSell.classList.add('active');
            tabBuy.classList.remove('active');
            payLabel.innerText = "PAY (USDT)";
            receiveLabel.innerText = "RECEIVE (ETB)";
            payUnit.innerText = "USDT";
            calcInput.value = "5.20";
        }
        calculate();
    };

    if (calcInput) {
        calcInput.addEventListener('input', calculate);
    }
});
document.addEventListener("DOMContentLoaded", function() {
    const themeToggleBtn = document.getElementById("theme-toggle");
    
    // ከዚህ በፊት ተጠቃሚው የመረጠውን ከለር ከ LocalStorage ማምጣት
    const currentTheme = localStorage.getItem("theme");
    if (currentTheme === "light") {
        document.body.classList.add("light-mode");
        if (themeToggleBtn) {
            themeToggleBtn.classList.remove("fa-moon");
            themeToggleBtn.classList.add("fa-sun");
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", function() {
            // በ body ላይ light-mode የሚባል class መኖሩን ማረጋገጥ
            document.body.classList.toggle("light-mode");
            
            if (document.body.classList.contains("light-mode")) {
                themeToggleBtn.classList.remove("fa-moon");
                themeToggleBtn.classList.add("fa-sun");
                localStorage.setItem("theme", "light");
            } else {
                themeToggleBtn.classList.remove("fa-sun");
                themeToggleBtn.classList.add("fa-moon");
                localStorage.setItem("theme", "dark");
            }
        });
    }
});