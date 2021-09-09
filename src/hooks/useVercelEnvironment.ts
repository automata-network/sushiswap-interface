const useVercelEnvironment = () => {
  const isProduction = process.env.DEPLOYMENT_ENV && process.env.DEPLOYMENT_ENV === 'production'
  const deploymentEnv = process.env.DEPLOYMENT_ENV || 'staging'
  console.log('deploymentEnv', deploymentEnv)
  return { isProduction, deploymentEnv }
}

export default useVercelEnvironment
