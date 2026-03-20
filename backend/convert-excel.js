const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function convertExcelToJson() {
  try {
    // Read the Excel file
    const excelPath = path.join(__dirname, '..', 'data', 'IPL2025_Players.xlsx');
    const workbook = XLSX.readFile(excelPath);

    // Get first sheet name
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Loaded ${jsonData.length} players from Excel`);
    console.log('Sample data:');
    console.log(JSON.stringify(jsonData[0], null, 2));

    // Map to our format
    const mappedPlayers = jsonData.map((row, index) => {
      const player = {
        id: index + 1,
        name: row.Name || row.Player || row['Player Name'] || 'Unknown',
        team: row.Team || row['Current Team'] || null,
        role: mapRole(row.Role || row.Position || row['Playing Role'] || 'BAT'),
        basePrice: parseBasePrice(row['Base Price'] || row['Reserve Price'] || row.Price || 20),
        category: mapCategory(row.Category || row.Type || 'UNCAPPED'),
        setNumber: parseInt(row.Set || row['Set Number'] || row.Group || 0),
        country: row.Country || row.Nationality || 'India',
        overseas: determineOverseas(row.Country || row.Nationality || 'India'),
        battingStyle: row['Batting Style'] || row.Batting || null,
        bowlingStyle: row['Bowling Style'] || row.Bowling || null,
        fantasyPoints: parseInt(row['Fantasy Points'] || row.Points || 0),
        stats: {
          matches: parseInt(row.Matches || 0),
          runs: parseInt(row.Runs || 0),
          wickets: parseInt(row.Wickets || 0),
          average: parseFloat(row.Average || 0),
          strikeRate: parseFloat(row['Strike Rate'] || 0)
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
    console.log('\nSample converted player:');
    console.log(JSON.stringify(mappedPlayers[0], null, 2));

  } catch (error) {
    console.error('Error converting Excel to JSON:', error);
  }
}

function mapRole(role) {
  const r = role.toUpperCase();
  if (r.includes('WICKET') || r.includes('KEEPER') || r.includes('WK')) return 'WK';
  if (r.includes('ALL') || r.includes('ROUND') || r.includes('AR')) return 'AR';
  if (r.includes('BOWL') || r.includes('SPIN') || r.includes('PACE')) return 'BOWL';
  return 'BAT';
}

function mapCategory(category) {
  const c = category.toUpperCase();
  if (c.includes('MARQUEE') || c.includes('STAR')) return 'MARQUEE';
  if (c.includes('CAPPED') && !c.includes('UNCAPPED')) return 'CAPPED';
  return 'UNCAPPED';
}

function parseBasePrice(price) {
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const match = price.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const value = parseFloat(match[1]);
      if (price.toLowerCase().includes('crore')) {
        return value * 100; // Convert crores to lakhs
      }
      return value;
    }
  }
  return 20; // Default base price
}

function determineOverseas(country) {
  const indianCountries = ['india', 'ind', 'indian'];
  return !indianCountries.includes(country.toLowerCase());
}

// Run the conversion
convertExcelToJson();