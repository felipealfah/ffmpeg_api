const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Read example request
const examplePath = path.join(__dirname, 'simple_video.json');
const exampleJson = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

// API endpoint
const API_URL = 'http://localhost:3000/api/v1/media/render';

async function testRenderApi() {
  try {
    console.log('Submitting render job...');
    const response = await axios.post(API_URL, exampleJson);
    
    console.log('Job created:', response.data);
    
    const jobId = response.data.data.jobId;
    
    // Poll for job status
    let completed = false;
    
    while (!completed) {
      console.log('Checking job status...');
      const statusResponse = await axios.get(`http://localhost:3000/api/v1/media/render/${jobId}`);
      const status = statusResponse.data.data;
      
      console.log(`Job status: ${status.status}, Progress: ${status.progress || 0}%`);
      
      if (status.status === 'completed' || status.status === 'failed') {
        completed = true;
        
        if (status.status === 'completed') {
          console.log('Job complete! Output:', status.output);
          
          // Get result
          const resultResponse = await axios.get(`http://localhost:3000/api/v1/media/render/${jobId}/result`);
          console.log('Result:', resultResponse.data);
        } else {
          console.error('Job failed:', status.error);
        }
      } else {
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testRenderApi(); 