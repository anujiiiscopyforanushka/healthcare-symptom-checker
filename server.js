import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import sqlite3 from "sqlite3";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(join(__dirname, 'public')));

// Initialize SQLite Database
const db = new sqlite3.Database('./healthcare.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('✅ Connected to SQLite database');
        db.run(`CREATE TABLE IF NOT EXISTS queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symptoms TEXT NOT NULL,
            analysis TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Function to log query to database
function logQuery(symptoms, analysis) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO queries (symptoms, analysis) VALUES (?, ?)`,
            [symptoms, analysis],
            function(err) {
                if (err) {
                    console.error('Error logging query:', err);
                    reject(err);
                } else {
                    console.log(`✅ Query logged with ID: ${this.lastID}`);
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Hugging Face API call function
async function queryHuggingFace(model, prompt) {
    const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: parseInt(process.env.MAX_TOKENS) || 150,
                    temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
                    top_p: parseFloat(process.env.TOP_P) || 0.9,
                    do_sample: true
                }
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Serve the HTML file
app.get("/", (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.post("/api/check-symptoms", async (req, res) => {
    try {
        const { symptoms } = req.body;

        if (!symptoms) {
            return res.status(400).json({ error: "Please provide symptoms text." });
        }

        console.log(`🔍 Processing symptoms: "${symptoms}"`);

        // Create prompt
        const prompt = `The user reports these symptoms: "${symptoms}". 
As a helpful AI assistant, provide general information about what might cause these symptoms, 
suggest when to see a doctor, and remind them this is not medical advice.`;

        let llmOutput;

        try {
            console.log('🔄 Calling Hugging Face API...');
            
            // Use a model that works with Inference API
            const model = process.env.GENERAL_QA_MODEL || "google/flan-t5-base";
            const result = await queryHuggingFace(model, prompt);
            
            // Extract text from response
            if (Array.isArray(result) && result[0] && result[0].generated_text) {
                llmOutput = result[0].generated_text;
            } else if (result.generated_text) {
                llmOutput = result.generated_text;
            } else {
                llmOutput = JSON.stringify(result);
            }
            
            console.log('✅ Hugging Face API call successful');

        } catch (hfError) {
            console.error('❌ Hugging Face error:', hfError.message);
            throw new Error('AI service temporarily unavailable');
        }

        // Add disclaimer
        llmOutput += "\n\n⚠️ This information is for educational purposes only and is not a medical diagnosis. Always consult a healthcare professional for proper medical advice.";

        // Log the query to database
        await logQuery(symptoms, llmOutput);

        res.json({ output: llmOutput });

    } catch (error) {
        console.error("🚨 Final error:", error.message);
        
        // Simple rule-based fallback
        const simpleAnalysis = generateSimpleAnalysis(req.body.symptoms);
        
        res.json({ output: simpleAnalysis });
    }
});

// Simple rule-based fallback (same as before)
function generateSimpleAnalysis(symptoms) {
    const symptomsLower = symptoms.toLowerCase();
    let analysis = `Based on your symptoms "${symptoms}", here's some general information:\n\n`;

    if (symptomsLower.includes('stomach') || symptomsLower.includes('abdominal')) {
        analysis += `• Stomach pain can have many causes including indigestion, gas, or mild food sensitivity\n`;
        analysis += `• Drink plenty of water and avoid spicy or heavy foods\n`;
        analysis += `• If pain is severe, persistent, or accompanied by fever/vomiting, see a doctor immediately\n`;
    } else if (symptomsLower.includes('headache')) {
        analysis += `• Headaches can be caused by stress, dehydration, or tension\n`;
        analysis += `• Rest in a quiet room and stay hydrated\n`;
        analysis += `• If headache is severe, sudden, or different from usual, seek medical attention\n`;
    } else if (symptomsLower.includes('fever')) {
        analysis += `• Fever is often a sign of infection\n`;
        analysis += `• Rest and stay hydrated\n`;
        analysis += `• If fever is high (over 103°F/39.4°C) or lasts more than 3 days, see a doctor\n`;
    } else {
        analysis += `• Monitor your symptoms and rest\n`;
        analysis += `• Stay hydrated and avoid strenuous activity\n`;
        analysis += `• If symptoms worsen or concern you, consult a healthcare professional\n`;
    }

    analysis += `\n⚠️ This information is for educational purposes only and is not a medical diagnosis. Always consult a healthcare professional for proper medical advice.`;

    return analysis;
}

// API to get query history
app.get("/api/history", (req, res) => {
    db.all("SELECT * FROM queries ORDER BY created_at DESC LIMIT 10", (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// API health check
app.get("/api/health", async (req, res) => {
    try {
        // Test with a simple model
        const response = await fetch(
            "https://api-inference.huggingface.co/models/google/flan-t5-base",
            {
                headers: {
                    Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: "Test",
                    parameters: { max_new_tokens: 5 }
                }),
            }
        );
        
        if (response.ok) {
            res.json({ 
                status: "healthy",
                database: "connected",
                huggingface: "working"
            });
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        res.json({ 
            status: "degraded",
            database: "connected", 
            huggingface: "failing",
            error: error.message
        });
    }
});

const PORT = process.env.APP_PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔑 API Key: ${process.env.HUGGINGFACE_API_KEY ? '✅ Present' : '❌ Missing'}`);
    console.log(`🤖 Using model: ${process.env.GENERAL_QA_MODEL || 'google/flan-t5-base'}`);
});