const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { YoutubeTranscript } = require("youtube-transcript");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5002;
const GEMINI_API_KEY =  process.env.GEMINI_API_KEY;

// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;


if (!GEMINI_API_KEY) {
    console.error("Missing Google Gemini API key. Please set it in .env");
    process.exit(1);
}

const fetchWithRetry = async (url, data, headers, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await axios.post(url, data, { headers });
        } catch (error) {
            if (error.response?.status === 429 && attempt < retries - 1) {
                const retryAfter = error.response.headers["retry-after"] || 5;
                console.warn(`Rate limited. Retrying after ${retryAfter} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            } else {
                throw error;
            }
        }
    }
};

app.post("/summarize", async (req, res) => {
    try {
        const { youtubeUrl } = req.body;
        const videoId = youtubeUrl.split("v=")[1]?.split("&")[0];

        if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

        // Fetch transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const fullText = transcript.map((item) => item.text).join(" ");

        // Summarize using Google Gemini with retry logic
        const response = await fetchWithRetry(
            "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY,
            {
                contents: [{ parts: [{ text: "Summarize this transcript in bullet points: " + fullText }] }]
            },
            {
                "Content-Type": "application/json"
            }
        );

        const summary = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available";
        res.json({ summary });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.response?.data || "Something went wrong" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
