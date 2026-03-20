const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function convertExcelToJson() {
  try {
    // Read the Excel file
    const excelPath = path.join(__dirname, '..', 'data', 'IPL2025_Players.xlsx');
    const workbook = XLSX.readFile(excelPath);

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON, starting from row 3 (skipping header rows)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

    console.log(`Loaded ${jsonData.length} players from Excel`);
    console.log('Available columns:', Object.keys(jsonData[0] || {}));

    if (jsonData.length === 0) {
      console.log('No data found in Excel file');
      return;
    }

    // Map to our format using actual column names from Excel
    const mappedPlayers = jsonData.map((row, index) => {
      const firstName = row['First Name'] || '';
      const surname = row['Surname'] || '';
      const fullName = row['Full Name'] || `${firstName} ${surname}`.trim();

      const player = {
        id: index + 1,
        name: fullName || 'Unknown',
        team: row['Previous IPLTeam(s)'] || null,
        role: mapRole(row['Specialism'] || 'BATTER'),
        basePrice: parseInt(row['Reserve Price Lakh Rs'] || 20),
        category: mapCategory(row['C/U/A'] || 'U'),
        setNumber: parseInt(row['Set No.'] || row['2025 Set'] || 0),
        country: row['Country'] || 'India',
        overseas: determineOverseas(row['Country'] || 'India'),
        battingStyle: row['Batting Style'] || null,
        bowlingStyle: row['Bowling Style'] || null,
        fantasyPoints: 0, // Not in Excel, using default
        stats: {
          matches: 0,
          runs: 0,
          wickets: 0,
          average: 0,
          strikeRate: 0,
          testCaps: parseInt(row['Test caps'] || 0),
          odiCaps: parseInt(row['ODI caps'] || 0),
          t20Caps: parseInt(row['T20 caps'] || 0)
        },
        age: parseInt(row['Age'] || 0),
        dateOfBirth: row['DOB'] || null
      };
      return player;
    });

    // Sort by set number to maintain set-wise order
    mappedPlayers.sort((a, b) => a.setNumber - b.setNumber);

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'data', 'ipl-players-2025-complete.json');
    fs.writeFileSync(outputPath, JSON.stringify(mappedPlayers, null, 2));

    console.log(`Successfully converted ${mappedPlayers.length} players to JSON`);
    console.log(`Output saved to: ${outputPath}`);

    // Show sample of converted data by set
    console.log('\nSample converted players by set:');
    const playersBySet = {};
    mappedPlayers.forEach(player => {
      if (!playersBySet[player.setNumber]) {
        playersBySet[player.setNumber] = [];
      }
      playersBySet[player.setNumber].push(player);
    });

    Object.keys(playersBySet).sort((a, b) => parseInt(a) - parseInt(b)).forEach(setNum => {
      const players = playersBySet[setNum];
      console.log(`Set ${setNum}: ${players.length} players`);
      players.slice(0, 3).forEach(player => {
        console.log(`  - ${player.name} (${player.role}, ${player.country}) - ₹${player.basePrice} lakhs`);
      });
    });

  } catch (error) {
    console.error('Error converting Excel to JSON:', error);
  }
}

function mapRole(specialism) {
  if (!specialism) return 'BAT';
  const s = specialism.toString().toUpperCase();
  if (s.includes('WICKET') || s.includes('KEEPER')) return 'WK';
  if (s.includes('ALL') || s.includes('ROUND')) return 'AR';
  if (s.includes('BOWL') || s.includes('SPIN') || s.includes('PACE')) return 'BOWL';
  return 'BAT';
}

function mapCategory(category) {
  if (!category) return 'UNCAPPED';
  const c = category.toString().toUpperCase();
  if (c === 'A' || c.includes('AUCTION')) return 'MARQUEE';
  if (c === 'C' || c.includes('CAPPED')) return 'CAPPED';
  return 'UNCAPPED';
}

function determineOverseas(country) {
  if (!country) return false;
  const indianCountries = ['india', 'ind', 'indian'];
  return !indianCountries.includes(country.toString().toLowerCase());
}

// Run the conversion
convertExcelToJson();