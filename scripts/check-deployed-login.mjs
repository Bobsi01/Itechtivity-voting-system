async function run() {
  const res = await fetch('https://itech2027-voting.appwrite.network/login');
  const html = await res.text();
  console.log('Login HTML size:', html.length);
  const chunkRegex = /\/_next\/static\/chunks\/[^"']+\.js/g;
  const chunks = [...new Set(html.match(chunkRegex) || [])];
  console.log('Found chunks:', chunks.length);
  for (const chunk of chunks) {
    const chunkRes = await fetch(`https://itech2027-voting.appwrite.network${chunk}`);
    const chunkText = await chunkRes.text();
    if (chunkText.includes('admin@itech2027.edu')) {
      console.log('Found test credentials in chunk:', chunk);
      console.log('Contains Quick Autofill:', chunkText.includes('Quick Autofill'));
      console.log('Contains Quick Test Credentials:', chunkText.includes('Quick Test Credentials'));
      console.log('Contains SHOW_QA_SHORTCUTS logic:', chunkText.includes('Tap to populate'));
    }
  }
}
run();
