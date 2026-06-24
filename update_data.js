const https = require('https');
const fs = require('fs');

const DATASET_PAGE_URL = 'https://data.gov.hk/tc-data/dataset/hk-epd-recycteam-waste-less-recyclable-collection-points-data';
const fallbackCsvUrl = 'https://www.wastereduction.gov.hk/sites/default/files/wasteless250918.csv';

const districts = [
  'Kwai_Tsing', 'Tuen_Mun', 'Yuen_Long', 'North', 'Tai_Po', 'Sai_Kung',
  'Sha_Tin', 'Tsuen_Wan', 'Islands', 'Yau_Tsim_Mong', 'Central_Western',
  'Eastern', 'Kowloon_City', 'Sham_Shui_Po', 'Southern', 'Wan_Chai',
  'Kwun_Tong', 'Wong_Tai_Sin'
];

const legends = [
  'Recycling Bins at Public Place',
  'Recycling Spots',
  'Private Collection Points (e.g. housing estates, shopping centres)',
  'NGO Collection Points',
  'Recycling Stations/Recycling Stores',
  'Street Corner Recycling Shops',
  'Smart Bin'
];

const wasteTypes = [
  'Metals',
  'Paper',
  'Plastics',
  'Plastic Bottle',
  'Glass Bottles',
  'Beverage Cartons',
  'Fluorescent Lamp',
  'Rechargeable Batteries',
  'Regulated Electrical Equipment',
  'Small Electrical and Electronic Equipment',
  'Clothes',
  'Other Description',
  'Barbeque Fork',
  'Printer Cartridges',
  'Food Waste',
  'Computers'
];

// Helper to fetch text from URL with headers
function fetchPageText(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        return fetchPageText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch page: Status code ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// Download file to disk
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download: Status code ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// Helper to parse CSV row correctly handling quotes and commas
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Compression function
function compressCSV(csvPath, jsonPath) {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n');
    if (lines.length < 2) throw new Error('CSV is empty or invalid.');

    const headers = parseCSVLine(lines[0]);
    const points = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCSVLine(lines[i]);
        if (row.length < headers.length) continue;

        const id = parseInt(row[0]);
        const state = row[1];
        if (state !== 'Accepted') continue;

        const district = row[2];
        const addrEn = row[3] + (row[4] ? ', ' + row[4] : '');
        const addrTc = row[5] + (row[6] ? ', ' + row[6] : '');
        const lat = parseFloat(row[9]);
        const lgt = parseFloat(row[10]);
        const wasteTypeStr = row[11];
        const legend = row[12];
        const openTc = row[18];
        const openEn = row[17];

        const districtIdx = districts.indexOf(district);
        const legendIdx = legends.indexOf(legend);
        
        const wasteIdxs = [];
        if (wasteTypeStr) {
            wasteTypeStr.split(',').forEach(w => {
                const idx = wasteTypes.indexOf(w.trim());
                if (idx !== -1) wasteIdxs.push(idx);
            });
        }

        points.push([
            id,
            districtIdx,
            addrTc,
            addrEn,
            lat,
            lgt,
            wasteIdxs,
            legendIdx,
            openTc || '',
            openEn || ''
        ]);
    }

    const outputData = {
        districts,
        legends,
        wasteTypes,
        points
    };

    fs.writeFileSync(jsonPath, JSON.stringify(outputData));
    console.log(`Successfully generated compressed JSON: ${jsonPath} (${points.length} points, ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

// Main update orchestrator
async function main() {
  const tempCsv = 'latest_dataset.csv';
  const outJson = 'data.json';
  let csvUrl = fallbackCsvUrl;

  try {
    console.log('Fetching dataset landing page HTML to extract the latest CSV URL...');
    const html = await fetchPageText(DATASET_PAGE_URL);
    
    // Search for data-url="...wasteless...csv"
    const match = html.match(/data-url="([^"]+wasteless[^"]*\.csv)"/i) || html.match(/data-url="([^"]+\.csv)"/i);
    
    if (match && match[1]) {
      csvUrl = match[1];
      console.log(`Found live CSV URL in HTML: ${csvUrl}`);
    } else {
      console.log(`Could not extract CSV URL from HTML. Falling back to default URL: ${csvUrl}`);
    }

    console.log(`Downloading latest CSV file from ${csvUrl}...`);
    await downloadFile(csvUrl, tempCsv);
    console.log('Download complete. Processing and compressing...');
    
    compressCSV(tempCsv, outJson);
    
    // Cleanup temporary CSV
    if (fs.existsSync(tempCsv)) {
      fs.unlinkSync(tempCsv);
    }
    console.log('Update pipeline finished successfully.');
  } catch (error) {
    console.error('Update pipeline failed:', error.message);
    process.exit(1);
  }
}

main();
