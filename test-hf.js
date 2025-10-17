import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

async function testConnection() {
    console.log('🔍 Testing Hugging Face connection...');
    console.log('API Key:', process.env.HUGGINGFACE_API_KEY ? '✅ Present' : '❌ Missing');
    console.log('Medical Model:', process.env.MEDICAL_QA_MODEL);

    try {
        // Test with a simple model first
        console.log('🧪 Testing with simple model...');
        const response = await hf.textGeneration({
            model: "google/flan-t5-base", // Use simpler model for testing
            inputs: "Hello, are you working?",
            parameters: {
                max_new_tokens: 20
            }
        });
        console.log('✅ Simple model test passed:', response.generated_text);
        
        // Now test with medical model
        console.log('🏥 Testing with medical model...');
        const medicalResponse = await hf.textGeneration({
            model: process.env.MEDICAL_QA_MODEL,
            inputs: "What is fever?",
            parameters: {
                max_new_tokens: 50
            }
        });
        console.log('✅ Medical model test passed:', medicalResponse.generated_text);
        
    } catch (error) {
        console.error('❌ Error details:', error.message);
        console.error('Error type:', error.constructor.name);
        
        if (error.response) {
            console.error('HTTP Status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testConnection();