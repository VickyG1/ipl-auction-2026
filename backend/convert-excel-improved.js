const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function convertExcelToJson() {
  try {
    // Read the Excel file
    const excelPath = path.join(__dirname, '..', 'data', 'IPL2025_Players.xlsx');
    const workbook = XLSX.readFile(excelPath);

    console.log('Available sheets:', workbook.SheetNames);

    // Get first sheet name
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get sheet range
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    console.log('Sheet range:', range);

    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log('Headers (first row):', jsonData[0]);
    console.log('Sample data row:', jsonData[1]);

    // Convert with proper headers
    const jsonDataWithHeaders = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Loaded ${jsonDataWithHeaders.length} players from Excel`);
    console.log('Available columns:', Object.keys(jsonDataWithHeaders[0] || {}));

    if (jsonDataWithHeaders.length === 0) {
      console.log('No data found in Excel file');
      return;
    }

    // Show first few rows to understand structure
    console.log('First 3 rows:');
    jsonDataWithHeaders.slice(0, 3).forEach((row, i) => {
      console.log(`Row ${i + 1}:`, Object.keys(row).map(key => `${key}: ${row[key]}`).join(', '));
    });

    // Map to our format with better column detection
    const mappedPlayers = jsonDataWithHeaders.map((row, index) => {
      const player = {
        id: index + 1,
        name: findValueByKeys(row, ['Player Name', 'Name', 'Player', 'PLAYER']) || 'Unknown',
        team: findValueByKeys(row, ['Team', 'Current Team', 'IPL Team', '2024']) || null,
        role: mapRole(findValueByKeys(row, ['Role', 'Playing Role', 'Position', 'Type']) || 'BAT'),
        basePrice: parseBasePrice(findValueByKeys(row, ['Base Price', 'Reserve Price', 'Price', 'Base']) || '20'),
        category: mapCategory(findValueByKeys(row, ['Category', 'Type', 'Player Type']) || 'UNCAPPED'),
        setNumber: parseInt(findValueByKeys(row, ['Set', 'Set Number', 'Group', 'Set No']) || '0'),
        country: findValueByKeys(row, ['Country', 'Nationality', 'Nation']) || 'India',
        overseas: determineOverseas(findValueByKeys(row, ['Country', 'Nationality', 'Nation']) || 'India'),
        battingStyle: findValueByKeys(row, ['Batting Style', 'Batting', 'Bat Style']) || null,
        bowlingStyle: findValueByKeys(row, ['Bowling Style', 'Bowling', 'Bowl Style']) || null,
        fantasyPoints: parseInt(findValueByKeys(row, ['Fantasy Points', 'Points', 'FP']) || '0'),
        stats: {
          matches: parseInt(findValueByKeys(row, ['Matches', 'Mat', 'Games']) || '0'),
          runs: parseInt(findValueByKeys(row, ['Runs', 'Total Runs']) || '0'),
          wickets: parseInt(findValueByKeys(row, ['Wickets', 'Wkts']) || '0'),
          average: parseFloat(findValueByKeys(row, ['Average', 'Avg', 'Batting Average']) || '0'),
          strikeRate: parseFloat(findValueByKeys(row, ['Strike Rate', 'SR', 'St Rate']) || '0')
        }
      };
      return player;
    });

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'data', 'ipl-players-2025-complete.json');
    fs.writeFileSync(outputPath, JSON.stringify(mappedPlayers, null, 2));

    console.log(`Successfully converted ${mappedPlayers.length} players to JSON`);
    console.log(`Output saved to: ${outputPath}`);

    // Show sample of converted data
    console.log('\nSample converted players:');
    mappedPlayers.slice(0, 3).forEach((player, i) => {
      console.log(`Player ${i + 1}: ${player.name} (${player.role}) - ${player.basePrice} lakhs`);
    });

  } catch (error) {
    console.error('Error converting Excel to JSON:', error);
  }
}

function findValueByKeys(obj, possibleKeys) {
  for (const key of possibleKeys) {
    const exactMatch = obj[key];
    if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
      return exactMatch;
    }
  }

  // Try case-insensitive search
  const objKeys = Object.keys(obj);
  for (const searchKey of possibleKeys) {
    const foundKey = objKeys.find(key =>
      key.toLowerCase().includes(searchKey.toLowerCase()) ||
      searchKey.toLowerCase().includes(key.toLowerCase())
    );
    if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') {
      return obj[foundKey];
    }
  }

  return null;
}

function mapRole(role) {
  if (!role) return 'BAT';
  const r = role.toString().toUpperCase();
  if (r.includes('WICKET') || r.includes('KEEPER') || r.includes('WK')) return 'WK';
  if (r.includes('ALL') || r.includes('ROUND') || r.includes('AR')) return 'AR';
  if (r.includes('BOWL') || r.includes('SPIN') || r.includes('PACE')) return 'BOWL';
  return 'BAT';
}

function mapCategory(category) {
  if (!category) return 'UNCAPPED';
  const c = category.toString().toUpperCase();
  if (c.includes('MARQUEE') || c.includes('STAR')) return 'MARQUEE';
  if (c.includes('CAPPED') && !c.includes('UNCAPPED')) return 'CAPPED';
  return 'UNCAPPED';
}

function parseBasePrice(price) {
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const match = price.toString().match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const value = parseFloat(match[1]);
      if (price.toString().toLowerCase().includes('crore')) {
        return value * 100; // Convert crores to lakhs
      }
      return value;
    }
  }
  return 20; // Default base price
}

function determineOverseas(country) {
  if (!country) return false;
  const indianCountries = ['india', 'ind', 'indian'];
  return !indianCountries.includes(country.toString().toLowerCase());
}

// Run the conversion
convertExcelToJson();