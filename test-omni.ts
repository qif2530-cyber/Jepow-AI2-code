import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('https://overseas-api-proxy-gateway-607215328011.asia-east1.run.app/api/v1/generate', {
      model: "gemini-3.1-pro-preview",
      prompt: "hello"
    }, {
      headers: {
        'Authorization': 'Bearer aiLZS253',
        'Content-Type': 'application/json'
      }
    });
    console.log("Success:", res.data);
  } catch (e: any) {
    console.error("Error:", e.response?.data || e.message);
  }
}

test();
