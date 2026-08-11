const fs = require('fs');

const file = fs.readFileSync('./services/dokumenKerjasamaApiService.ts', 'utf8');
console.log(file.includes('return (response.data?.data ?? []).map((row) => {'));
