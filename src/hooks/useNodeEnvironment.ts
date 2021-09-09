const useVercelEnvironment = () => {
  const isProduction = process.env.NODE_ENV && process.env.NODE_ENV === 'production'
  const deploymentEnv = process.env.NODE_ENV && process.env.NODE_ENV !== 'production' ? 'staging' : 'production'

  // TODO Remove 'staging' for deploymentEnv value when production version of Geode is ready
  return { isProduction, deploymentEnv: 'staging' }
}

export default useVercelEnvironment
