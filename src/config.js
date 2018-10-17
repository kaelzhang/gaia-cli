const path = require('path')
const {shape} = require('skema')
const minimist = require('minimist')
const {isString, isNumber} = require('core-util-is')

const {fail, testFiles} = require('./util')

const GaeaConfig = shape({
  dev: shape({
    env: Object
  }),

  service: shape({
    root: {
      set (root, cwd) {
        if (!isString(root)) {
          return fail('service.root must be a path')
        }

        return path.resolve(cwd, root)
      }
    },

    port: {
      validate (port) {
        if (!isNumber(port)) {
          fail('service.port must be a number')
          return
        }

        return true
      }
    }
  }),

  docker: {
    optional: true,
    type: shape({
      name: {
        validate: isString
      }
    })
  }
})

const Config = shape({
  cwd: {
    default () {
      return process.cwd()
    },

    set (cwd) {
      return path.resolve(cwd)
    }
  },

  debug: {
    default: false
  },

  pkg: {
    default: null,
    set () {
      try {
        return require(path.join(this.parent.cwd, 'package.json'))
      } catch (e) {
        return fail('fails to read package.json: %s', e.stack || e.message)
      }
    }
  },

  gaea: {
    default: null,
    set (_, gaeaConfigRequired) {
      const {cwd} = this.parent
      const gaearcFile = testFiles(['.gaearc.js'], cwd)

      if (gaearcFile) {
        return GaeaConfig.from(require(path.join(cwd, gaearcFile)), [cwd])
      }

      if (gaeaConfigRequired) {
        return fail('.gaearc.js is not found')
      }

      return null
    }
  }
})

const get = gaeaConfigRequired => {
  const argv = minimist(process.argv.slice(2))

  return {
    argv,
    config: config(argv, gaeaConfigRequired)
  }
}

const config = (options, gaeaConfigRequired) =>
  Config.from(options, [gaeaConfigRequired])

module.exports = {
  get,
  config
}