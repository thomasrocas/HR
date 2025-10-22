const express = require('express');
const { Client } = require('pg');      
const multer = require('multer');     // for file uploads
const fs = require('fs');
const path = require('path');
const copyFrom = require('pg-copy-streams').from;

const app = express();
const PORT = 3000;

const client = new Client({
  user: 'postgres',       
  host: 'localhost',       
  database: 'clinicalvisits',     
  password: '@DbAdmin@',   
  port: 5432,              
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL!'))
  .catch(err => console.error('PostgreSQL connection error', err));

const upload = multer({ dest: 'uploads/' });
app.use(express.static('public')); 

app.post('/upload', upload.single('csvfile'), (req, res) => {
  const filePath = req.file.path;
  const tableName = 'maintable';

  const stream = client.query(copyFrom(`COPY ${tableName} FROM STDIN CSV HEADER NULL ''`));

  const fileStream = fs.createReadStream(filePath);

  fileStream.pipe(stream).on('finish', () => {
    res.send('CSV imported successfully!');
    fs.unlinkSync(filePath);
  }).on('error', (err) => {
    console.error(err);
    res.send('Error importing CSV.');
  });
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
