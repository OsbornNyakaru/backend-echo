import dotenv from "dotenv"
import { checkTavusApiHealth, validatePersonaExists } from "../utils/tavusHelpers.js"

dotenv.config()

async function checkSetup() {
  console.log("🔍 Checking Tavus Backend Setup...\n")

  // Check environment variables
  const requiredEnvVars = ["TAVUS_API_KEY", "TAVUS_PERSONA_ID"]
  const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName])

  if (missingEnvVars.length > 0) {
    console.error("❌ Missing required environment variables:")
    missingEnvVars.forEach((varName) => console.error(`   - ${varName}`))
    console.log("\n📝 Please check your .env file and ensure all required variables are set.\n")
    process.exit(1)
  }

  console.log("✅ Environment variables configured")

  // Check Tavus API connectivity
  console.log("🔗 Checking Tavus API connectivity...")
  const apiHealth = await checkTavusApiHealth()

  if (!apiHealth.healthy) {
    console.error("❌ Tavus API connection failed:", apiHealth.error || apiHealth.statusText)
    process.exit(1)
  }

  console.log("✅ Tavus API connection successful")

  // Validate persona exists
  console.log("👤 Validating persona...")
  const personaValidation = await validatePersonaExists(process.env.TAVUS_PERSONA_ID)

  if (!personaValidation.exists) {
    console.error("❌ Persona validation failed:", personaValidation.error || "Persona not found")
    console.log("💡 Please check your TAVUS_PERSONA_ID in the .env file")
    process.exit(1)
  }

  console.log("✅ Persona validation successful")

  console.log("\n🎉 Setup check completed successfully!")
  console.log("🚀 Your Tavus backend is ready to run.")
}

checkSetup().catch(console.error)
