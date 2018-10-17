#!/usr/bin/env node

// Publish gaea puppet

const tmp = require('tmp')
const spawn = require('cross-spawn')
const path = require('path')
const fs = require('fs')
const {glob, hasMagic} = require('glob-gitignore')
const Ignore = require('ignore')
const fse = require('fs-extra')
const {isArray} = require('core-util-is')
const debug = require('util').debuglog('gaea-publish')

const {fail, testFiles} = require('./lib/util')

const IGNORE_FILES = [
  '.npmignore',
  '.gitignore'
]

const README_FILES = [
  'README',
  'README.md',
  'Readme',
  'Readme.md',
  'readme',
  'readme.md'
]

const LICENSE_FILES = [
  'LICENCE',
  'LICENSE'
]

const CHANGELOG_FILES = [
  'CHANGELOG',
  'CHANGELOG.md',
  'HISTORY',
  'HISTORY.md'
]

const ALWAYS_IGNORES = [
  '.*.swp',
  '._*',
  '.DS_Store',
  '.git',
  '.hg',
  '.npmrc',
  '.lock-wscript',
  '.svn',
  '.wafpickle-*',
  'config.gypi',
  'CVS',
  'npm-debug.log',
  'node_modules'
]

const EMPTY = ''
const GAEA = 'gaea'
const REGEX_IS_DIR = /\/+$/

const isFile = filepath => !REGEX_IS_DIR.test(filepath)

const options = Options.from(argv)

const getFilesByFiles = async (files, cwd) => {
  if (!isArray(files)) {
    return fail('gaea.files must be an array')
  }

  const patterns = []
  const found = []

  files.forEach(file => {
    if (hasMagic(file)) {
      patterns.push(file)
      return
    }

    if (REGEX_IS_DIR.test(file)) {
      found.push(file.replace(REGEX_IS_DIR, EMPTY))
      return
    }

    found.push(file)
  })

  if (!patterns.length) {
    return found
  }

  const globbed = await glob(patterns, {
    cwd,
    marked: true
  })

  return found.concat(globbed)
}

const getFilesByIgnore = cwd => {
  const ignore = Ignore().add(ALWAYS_IGNORES)
  const ignoreFile = testFiles(IGNORE_FILES, cwd)
  if (ignoreFile) {
    ignore.add(fs.readFileSync(path.join(cwd, ignoreFile)).toString())
  }

  return glob(['**'], {
    cwd,
    ignore,
    mark: true
  })
}

const testAndAddFile = (filesToTest, files, cwd) => {
  const tested = testFiles(filesToTest, cwd)
  if (!tested) {
    return
  }

  if (files.indexOf(tested) === -1) {
    files.push(tested)
  }
}

const checkMain = (files, pkg, cwd) => {
  const main = pkg.main
  const filesToTest = []

  if (main) {
    filesToTest.push(main)
    filesToTest.push(`${main}.js`)
  }

  testAndAddFile(filesToTest, files, cwd)
}

const getFilesToPack = async (pkg, cwd) => {
  const gaea = pkg.gaea || {}

  let files = gaea.files
    ? await getFilesByFiles(gaea.files, cwd)
    : await getFilesByIgnore(cwd)

  testAndAddFile(README_FILES, files, cwd)
  testAndAddFile(LICENSE_FILES, files, cwd)
  testAndAddFile(CHANGELOG_FILES, files, cwd)

  checkMain(files, pkg, cwd)

  return files.filter(isFile)
}

const copyFiles = (from, to, files) => {
  const tasks = files.map(file => fse.copy(
    path.join(from, file),
    path.join(to, file)
  ))

  return Promise.all(tasks)
}

const createDependencies = (
  original_dependencies, gaea_dependencies
) => {
  const new_dependencies = {}

  if (!(GAEA in original_dependencies)) {
    return fail('gaea must be npm installed')
  }

  new_dependencies.gaea = original_dependencies.gaea

  if (!gaea_dependencies) {
    return new_dependencies
  }

  if (!isArray(gaea_dependencies)) {
    return fail('gaea.dependencies must be an array')
  }

  gaea_dependencies.forEach(dep => {
    if (dep === GAEA) {
      return
    }

    if (!(dep in original_dependencies)) {
      return fail('depencency "%s" is not in package.dependencies')
    }

    new_dependencies[dep] = original_dependencies[dep]
  })

  return gaea_dependencies
}

const writePackage = (pkg, to) => {
  const {
    dependencies = {},
    files,
    gaea,
    ...cleaned
  } = pkg

  cleaned.dependencies = createDependencies(dependencies, gaea.dependencies)

  if (gaea.files) {
    cleaned.files = gaea.files
  }

  const package_string = JSON.stringify(cleaned, null, 2)

  fs.writeFileSync(
    path.join(to, 'package.json'),
    package_string
  )

  debug('package.json: %s', package_string)
}

tmp.dir(async (err, dir) => {
  if (err) {
    return fail('fails to create tmp dir: %s', err.stack || err.message)
  }

  const {
    cwd,
    pkg
  } = options

  const files = await getFilesToPack(pkg, cwd)

  debug('files: %s', JSON.stringify(files, null, 2))

  await copyFiles(cwd, dir, files)
  writePackage(pkg, dir)

  const args = ['publish'].concat(options._)

  debug('npm %s', args.join(' '))

  const child = spawn('npm', args, {
    stdio: 'inherit',
    cwd: dir
  })
})