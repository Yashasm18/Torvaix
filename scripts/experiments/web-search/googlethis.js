const google = require('googlethis');
const options = {
  page: 0, 
  safe: false, // Safe Search
  parse_ads: false, 
  additional_params: { hl: 'en' }
}
google.search('latest space news', options).then(response => {
  console.log(JSON.stringify(response.results.slice(0, 3), null, 2));
}).catch(console.error);
