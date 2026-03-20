const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function analyzeExcel() {
  try {
    // Read the Excel file
    const excelPath = path.join(__dirname, '..', 'data', 'IPL2025_Players.xlsx');
    const workbook = XLSX.readFile(excelPath);

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get raw array data to understand structure
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,  // Return array of arrays
      blankrows: false
    });

    console.log('Total rows:', rawData.length);
    console.log('Row 0 (headers):', rawData[0]);
    console.log('Row 1 (possibly subheaders):', rawData[1]);
    console.log('Row 2 (first data row):', rawData[2]);
    console.log('Row 3 (second data row):', rawData[3]);

    // Find the actual header row
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && row.some(cell =>
        cell && typeof cell === 'string' &&
        (cell.toLowerCase().includes('name') ||
         cell.toLowerCase().includes('set') ||
         cell.toLowerCase().includes('price'))
      )) {
        headerRowIndex = i;
        console.log(`Found header row at index ${i}:`, row);
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log('No header row found, using first row');
      headerRowIndex = 0;
    }

    // Convert with proper header
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      range: headerRowIndex + 1  // Start from row after header
    });

    console.log(`\nLoaded ${jsonData.length} players from Excel`);
    if (jsonData.length > 0) {
      console.log('Available columns:', Object.keys(jsonData[0]));
      console.log('First player data:', jsonData[0]);
    }

  } catch (error) {
    console.error('Error analyzing Excel:', error);
  }
}

// Run the analysis
analyzeExcel();