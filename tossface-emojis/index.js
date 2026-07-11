// Script to remove all the stuff misskey doesn't want for their emoji names
const path = require('path');
const fs = require('fs');

const folderPath = './dist';

try {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        const fileInfo = path.parse(file);

        const oldPath = path.join(__dirname, folderPath, file);
        fileInfo.name = fileInfo.name.toLowerCase();
        fileInfo.name = fileInfo.name.replaceAll('u', '');
        fileInfo.name = fileInfo.name.replaceAll('_', '-');
        const newPath = path.join(__dirname, folderPath, `${fileInfo.name}${fileInfo.ext}`);

        fs.renameSync(oldPath, newPath);
    }
} catch (error) {
    console.log(error);
}
