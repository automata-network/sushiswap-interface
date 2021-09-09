const useVercelEnvironment = () => {
  const isProduction = process.env.DEPLOYMENT_ENV && process.env.DEPLOYMENT_ENV === 'production'
  const deploymentEnv = process.env.DEPLOYMENT_ENV
  return { isProduction, deploymentEnv }
}

export default useVercelEnvironment
