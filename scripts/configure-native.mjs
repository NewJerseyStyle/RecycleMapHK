import { readFile, writeFile } from 'node:fs/promises';

const platform = process.argv[2];

if (!['android', 'ios'].includes(platform)) {
  throw new Error('Usage: npm run native:configure -- <android|ios>');
}

if (platform === 'android') {
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  let manifest = await readFile(manifestPath, 'utf8');
  const permissions = [
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  ].join('\n');

  if (!manifest.includes('android.permission.ACCESS_FINE_LOCATION')) {
    manifest = manifest.replace('<application', `${permissions}\n\n    <application`);
    await writeFile(manifestPath, manifest);
  }
}

if (platform === 'ios') {
  const plistPath = 'ios/App/App/Info.plist';
  let plist = await readFile(plistPath, 'utf8');
  const locationUsage = [
    '\t<key>NSLocationWhenInUseUsageDescription</key>',
    '\t<string>RecycleHK uses your location to show the nearest recycling points.</string>',
  ].join('\n');

  if (!plist.includes('NSLocationWhenInUseUsageDescription')) {
    plist = plist.replace('</dict>', `${locationUsage}\n</dict>`);
    await writeFile(plistPath, plist);
  }
}

console.log(`Configured ${platform} permissions.`);
