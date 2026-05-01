import com.android.build.api.dsl.ApplicationExtension
import com.android.build.api.dsl.LibraryExtension

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

subprojects {
    plugins.withId("com.android.application") {
        extensions.configure<ApplicationExtension>("android") {
            lint {
                checkReleaseBuilds = false
            }
        }
    }

    plugins.withId("com.android.library") {
        extensions.configure<LibraryExtension>("android") {
            lint {
                checkReleaseBuilds = false
            }
        }
    }
}

tasks.register("clean").configure {
    delete("build")
}
