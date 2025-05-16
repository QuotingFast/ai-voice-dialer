// fine_tune.js

const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

// your real OpenAI key here:
const OPENAI_API_KEY = "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";

async function runFineTune() {
  // 1) Upload the JSONL
  console.log("1) Uploading training_data.jsonl...");
  const form = new FormData();
  form.append("file", fs.createReadStream("./training_data.jsonl"));
  form.append("purpose", "fine-tune");

  const uploadRes = await axios.post(
    "https://api.openai.com/v1/files",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );
  const fileId = uploadRes.data.id;
  console.log("   Uploaded, file ID =", fileId);

  // 2) Create the fine-tune job
  console.log("2) Creating fine-tune job...");
  const ftRes = await axios.post(
    "https://api.openai.com/v1/fine-tunes",
    { training_file: fileId, model: "gpt-3.5-turbo", n_epochs: 4 },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );
  const ftId = ftRes.data.id;
  console.log("   Fine-tune job ID =", ftId);

  // 3) Poll until it finishes
  let status = ftRes.data.status;
  while (status !== "succeeded" && status !== "failed") {
    console.log(`   Status is "${status}", waiting 30s…`);
    await new Promise(r => setTimeout(r, 30000));
    const statusRes = await axios.get(
      `https://api.openai.com/v1/fine-tunes/${ftId}`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    status = statusRes.data.status;
  }

  // 4) Done!
  const finalRes = await axios.get(
    `https://api.openai.com/v1/fine-tunes/${ftId}`,
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );
  console.log("3) Final status:", finalRes.data.status);
  console.log("   Your fine-tuned model is:", finalRes.data.fine_tuned_model);
}

runFineTune().catch(err => {
  console.error("❌ Error during fine-tune:", err.response?.data || err.message);
  process.exit(1);
});
