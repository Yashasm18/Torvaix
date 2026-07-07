const cheerio = require('cheerio');
fetch('https://html.duckduckgo.com/html/?q=latest+space+news', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
}).then(res => res.text()).then(html => {
  const $ = cheerio.load(html);
  const results = [];
  $('.result').each((i, el) => {
    results.push({
      title: $(el).find('.result__title').text().trim(),
      snippet: $(el).find('.result__snippet').text().trim(),
      url: $(el).find('.result__url').attr('href')
    });
  });
  console.log(JSON.stringify(results.slice(0, 3), null, 2));
});
