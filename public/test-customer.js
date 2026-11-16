const axios = require('axios');

async function createTBRCustomer() {
    try {
        // ትክክለኛው አድራሻ .com ነው! 
        const response = await axios.post('https://api.bitnob.com/api/v1/customers', {
            email: "test1@tbrexchange.com",
            firstName: "TBR",
            lastName: "Client",
            phone: "911223344",
            countryCode: "251"
        }, {
            headers: {
                // ትክክለኛው የ Live ሚስጥራዊ ቁልፍህ እዚህ ገብቷል
                'Authorization': `Bearer hgs_1ILQXcx5N8jUEzoqpHvC9tQkFQsdA9Ra`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log("✅ Customer Created Successfully!");
        console.log("Customer ID:", response.data.data.id);
        
    } catch (error) {
        console.log("❌ Status Code:", error.response ? error.response.status : "Network Error");
        console.log("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

createTBRCustomer();