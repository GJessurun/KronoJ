import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const kind = process.argv[2];

function fail(message) {
  console.error(`Release annulée : ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function gitOutput(args) {
  const result = git(args, { capture: true });
  if (result.status !== 0) {
    fail(result.stderr.trim() || `git ${args.join(' ')} a échoué.`);
  }
  return result.stdout.trim();
}

if (!['patch', 'minor', 'major'].includes(kind)) {
  fail('indiquez le type de version : npm run release -- patch|minor|major.');
}

const pendingChanges = gitOutput(['status', '--short']);
if (pendingChanges) {
  console.log('Ces modifications seront incluses dans le commit de release :');
  console.log(pendingChanges);
}

const branch = gitOutput(['branch', '--show-current']);
if (!branch) {
  fail('impossible de publier depuis un HEAD détaché.');
}

const packagePath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');
const tauriPath = resolve(root, 'src-tauri/tauri.conf.json');
const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
const cargoLockPath = resolve(root, 'src-tauri/Cargo.lock');

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const lockJson = JSON.parse(readFileSync(lockPath, 'utf8'));
const tauriConfig = JSON.parse(readFileSync(tauriPath, 'utf8'));
const cargoLock = readFileSync(cargoLockPath, 'utf8');
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);

if (!versionMatch) {
  fail(`la version actuelle "${packageJson.version}" n'est pas un semver x.y.z.`);
}
if (!lockJson.packages?.['']) {
  fail('package-lock.json ne contient pas les métadonnées du projet.');
}

let [, major, minor, patch] = versionMatch.map(Number);
if (kind === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (kind === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const version = `${major}.${minor}.${patch}`;
const tag = `v${version}`;
if (gitOutput(['tag', '--list', tag])) {
  fail(`le tag local ${tag} existe déjà.`);
}
if (gitOutput(['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${tag}`])) {
  fail(`le tag ${tag} existe déjà sur origin.`);
}

const cargoToml = readFileSync(cargoPath, 'utf8');
const packageStart = cargoToml.indexOf('[package]');
const nextSection = cargoToml.indexOf('\n[', packageStart + '[package]'.length);
const packageSection = cargoToml.slice(
  packageStart,
  nextSection === -1 ? cargoToml.length : nextSection,
);
const cargoVersion = /^version\s*=\s*"[^"]+"/m;
if (packageStart === -1 || !cargoVersion.test(packageSection)) {
  fail('impossible de trouver la version du paquet dans src-tauri/Cargo.toml.');
}

const cargoLockVersion = /(\[\[package\]\]\r?\nname = "kronoj"\r?\nversion = ")[^"]+(")/;
if (!cargoLockVersion.test(cargoLock)) {
  fail('impossible de trouver la version du paquet dans src-tauri/Cargo.lock.');
}

packageJson.version = version;
lockJson.version = version;
lockJson.packages[''].version = version;
tauriConfig.version = version;

const updatedCargo = cargoToml.replace(cargoVersion, `version = "${version}"`);
const updatedCargoLock = cargoLock.replace(cargoLockVersion, `$1${version}$2`);
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`);
writeFileSync(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
writeFileSync(cargoPath, updatedCargo);
writeFileSync(cargoLockPath, updatedCargoLock);

const add = git(['add', '--all']);
if (add.status !== 0) {
  fail('git add --all a échoué.');
}

const commit = git(['commit', '-m', `chore: release ${tag}`]);
if (commit.status !== 0) {
  fail('la création du commit a échoué ; les fichiers versionnés sont conservés.');
}

const createTag = git(['tag', '-a', tag, '-m', `Release ${tag}`]);
if (createTag.status !== 0) {
  fail('la création du tag a échoué ; le commit local est conservé.');
}

const push = git([
  'push',
  '--atomic',
  'origin',
  `HEAD:refs/heads/${branch}`,
  `refs/tags/${tag}`,
]);
if (push.status !== 0) {
  fail(`le push atomique a échoué. Le commit et le tag ${tag} restent locaux ; vérifiez le remote puis poussez-les manuellement.`);
}

console.log(`Release ${tag} poussée sur GitHub. Le workflow Actions va compiler les installateurs.`);
