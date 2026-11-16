async function testMoonAPI() {
    const moonEndpoint = 'https://api.paywithmoon.com/mcp';

    // ወደ PayWithMoon የምንልከው ጥያቄ (JSON-RPC ፎርማት)
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list" // የካርድ ማውጫ ትዕዛዞችን ዝርዝር እንዲሰጠን
    };

    try {
        console.log("ወደ PayWithMoon ጥያቄ እየተላከ ነው...");
        
        const response = await fetch(moonEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("ከ PayWithMoon የተመለሰ ምላሽ፦");
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error("ኤረር አጋጥሟል፦", error);
    }
}

testMoonAPI();