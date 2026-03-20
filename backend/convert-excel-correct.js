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

    // Get raw data to understand structure
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false
    });

    // Extract headers from first row
    const headers = rawData[0];
    console.log('Headers:', headers);

    // Process data starting from row 3 (skip header and subheader rows)
    const dataRows = rawData.slice(2);
    console.log(`Processing ${dataRows.length} data rows`);

    // Map to our format using array indices
    const mappedPlayers = dataRows.map((row, index) => {
      const player = {
        id: index + 1,
        name: row[20] || `${row[3] || ''} ${row[4] || ''}`.trim() || 'Unknown', // Full Name or First + Surname
        team: row[15] || null, // Previous IPLTeam(s)
        role: mapRole(row[8] || 'BATTER'), // Specialism
        basePrice: parseInt(row[19] || 20), // Reserve Price Lakh Rs
        category: mapCategory(row[18] || 'U'), // C/U/A
        setNumber: parseInt(row[1] || 0), // Set No.
        country: row[5] || 'India', // Country
        overseas: determineOverseas(row[5] || 'India'),
        battingStyle: row[9] || null, // Batting Style
        bowlingStyle: row[10] || null, // Bowling Style
        fantasyPoints: 0,
        stats: {
          matches: 0,
          runs: 0,
          wickets: 0,
          average: 0,
          strikeRate: 0,
          testCaps: parseInt(row[11] || 0), // Test caps
          odiCaps: parseInt(row[12] || 0), // ODI caps
          t20Caps: parseInt(row[13] || 0) // T20 caps
        },
        age: parseInt(row[7] || 0), // Age
        dateOfBirth: row[6] || null // DOB
      };
      return player;
    }).filter(player => player.name !== 'Unknown' && player.name.trim() !== ''); // Remove invalid entries

    // Sort by set number to maintain set-wise order
    mappedPlayers.sort((a, b) => a.setNumber - b.setNumber);

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'data', 'ipl-players-2025-complete.json');
    fs.writeFileSync(outputPath, JSON.stringify(mappedPlayers, null, 2));

    console.log(`Successfully converted ${mappedPlayers.length} players to JSON`);
    console.log(`Output saved to: ${outputPath}`);

    // Show sample by sets
    console.log('\nPlayers by set:');
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

    console.log(`\nTotal: ${mappedPlayers.length} players converted successfully`);

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