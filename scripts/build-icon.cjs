const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;
(async()=>{
  const root=path.join(__dirname,'..'), svg=path.join(root,'build','icon.svg'), png=path.join(root,'build','icon.png'), ico=path.join(root,'build','icon.ico');
  await sharp(svg).resize(1024,1024).png().toFile(png);
  const frames=[]; for(const size of [16,24,32,48,64,128,256]) frames.push(await sharp(svg).resize(size,size).png().toBuffer());
  fs.writeFileSync(ico,await pngToIco(frames));
  console.log('Generated FileCat icon');
})().catch(e=>{console.error(e);process.exit(1)});
