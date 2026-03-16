const http = require('http');

http.get('http://localhost:3000/api/blogs/topic-counts', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('API Response Success:', json.success);
            if (json.counts && json.counts.length > 0) {
                console.log('Sample counts:', json.counts.slice(0, 5));
            } else {
                console.log('No counts returned.');
            }
        } catch (e) {
            console.error('Failed to parse response:', e.message);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('API Error:', err.message);
});
