// Test the image validator
const { validateScreenshot } = require('./utils/imageValidator');

const testUrl = 'https://media.discordapp.net/attachments/1442917276214100079/1442917304085250078/441E9576-AE95-4C41-BAF6-1959CC754931.png?ex=69272cf5&is=6925db75&hm=b45b596fad2f820497cd42e92b77ce3b063d47abb21be51cb358d40d459a56cc&=&format=webp&quality=lossless&width=1964&height=1104';
const expectedSize = 7; // Change to match game // Expected game size in GB

async function test() {
    console.log('Testing Image Validator...\n');
    
    const result = await validateScreenshot(testUrl, expectedSize);
    
    console.log('\n========== RESULT ==========');
    console.log('Success:', result.success);
    console.log('Size Detected:', result.sizeDetected, 'GB');
    console.log('Size Valid:', result.sizeValid);
    console.log('WUB Detected:', result.wubDetected);
    console.log('WUB Enabled:', result.wubEnabled);
    console.log('Confidence:', result.confidence);
    console.log('Needs Staff:', result.needsStaffReview);
    console.log('\nMessage:\n', result.message);
}

test();