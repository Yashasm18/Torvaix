const { search } = require('duck-duck-scrape');
search('latest space news').then(results => {
  console.log(JSON.stringify(results.results.slice(0, 3), null, 2));
}).catch(console.error);
