const CDP = require('chrome-remote-interface')
const chalk = require('chalk')

let eventFilter
let options

const severityColors = {
  'verbose': (a) => a,
  'info': chalk.blue,
  'warning': chalk.yellow,
  'error': chalk.red
}

const severityIcons = {
  'verbose': ' ',
  'info': '🛈',
  'warning': '⚠',
  'error': '⚠',
}

function log(msg) {
  console.log(msg)
}

function logEntry(params) {
  if (eventFilter && !eventFilter('browser', params.entry)) {
    return
  }

  const { level, source, text, timestamp, url, lineNumber, stackTrace, args } = params.entry
  const color = severityColors[level]
  const icon = severityIcons[level]

  const prefix = `[${new Date(timestamp).toISOString()}] ${icon} `
  const prefixSpacer = ' '.repeat(prefix.length)

  log(color(`${prefix}${chalk.bold(level)} (${source}): ${text}`))

  const logAdditional = (msg) => {
    log(color(`${prefixSpacer}${msg}`))
  }

  if (url) {
    logAdditional(`${chalk.bold('URL')}: ${url}`)
  }

  if (stackTrace && lineNumber) {
    logAdditional(`Stack trace line number: ${lineNumber}`)
    logAdditional(`Stack trace description: ${stackTrace.description}`)
    logAdditional(`Stack call frames: ${stackTrace.callFrames.join(', ')}`)
  }

  if (args) {
    logAdditional(`Arguments:`)
    logAdditional('  ' + JSON.stringify(args, null, 2).split('\n').join(`\n${prefixSpacer}  `).trimRight())
  }
}

function logConsole(params) {
  if (eventFilter && !eventFilter('console', params)) {
    return
  }

  const { type, args, timestamp } = params
  const level = type === 'error' ? 'error' : 'verbose'
  const color = severityColors[level]
  const icon = severityIcons[level]

  const prefix = `[${new Date(timestamp).toISOString()}] ${icon} `
  const prefixSpacer = ' '.repeat(prefix.length)

  log(color(`${prefix}${chalk.bold(`console.${type}`)} called`))

  const logAdditional = (msg) => {
    log(color(`${prefixSpacer}${msg}`))
  }

  if (args) {
    if (options && options.rawConsoleData && args[0] && args[0].value) {
      logAdditional(args[0].value)
    }
    else {
      logAdditional(`Arguments:`)
      logAdditional('  ' + JSON.stringify(args, null, 2).split('\n').join(`\n${prefixSpacer}  `).trimRight())
    }
  }
}

function install(on, filter, userOptions = {}) {
  eventFilter = filter
  options = userOptions
  on('before:browser:launch', browserLaunchHandler)
}

function browserLaunchHandler(browser = {}, args) {
  const isChrome = ['chrome'].includes(browser.family) || browser.name === 'chrome'
  if (!isChrome) {
    return log(` [cypress-log-to-output] Warning: An unsupported browser family was used, output will not be logged to console: ${browser.family}`)
  }

  const rdp = 40000 + Math.round(Math.random() * 25000)

  if (isChrome) {
    args.push(`--remote-debugging-port=${rdp}`)
  }

  log(' [cypress-log-to-output] Attempting to connect to Chrome Debugging Protocol')

  const tryConnect = () => {
    new CDP({
      port: rdp
    })
    .then((cdp) => {
      log(' [cypress-log-to-output] Connected to Chrome Debugging Protocol')

      /** captures logs from the browser */
      cdp.Log.enable()
      cdp.Log.entryAdded(logEntry)

      /** captures logs from console.X calls */
      cdp.Runtime.enable()
      cdp.Runtime.consoleAPICalled(logConsole)

      cdp.on('disconnect', () => {
        log(' [cypress-log-to-output] Chrome Debugging Protocol disconnected')
      })
    })
    .catch(() => {
      setTimeout(tryConnect, 100)
    })
  }

  tryConnect()

  return args
}

module.exports = {
  install,
  browserLaunchHandler
}
