const useVercelEnvironment = () => {
  const isProduction = process.env.NODE_ENV && process.env.NODE_ENV === 'production'
  const deploymentEnv = process.env.NODE_ENV && process.env.NODE_ENV !== 'production' ? 'staging' : 'production'

  return { isProduction, deploymentEnv }
}

export default useVercelEnvironment
