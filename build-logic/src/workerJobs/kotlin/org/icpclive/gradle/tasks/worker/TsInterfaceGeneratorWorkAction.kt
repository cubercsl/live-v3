package org.icpclive.gradle.tasks.worker

import dev.adamko.kxstsgen.KxsTsGenerator
import dev.adamko.kxstsgen.core.TsLiteral
import dev.adamko.kxstsgen.core.TsSourceCodeGenerator
import dev.adamko.kxstsgen.core.TsTypeRef
import dev.adamko.kxstsgen.KxsTsConfig
import kotlinx.serialization.serializer
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.ListProperty
import org.gradle.workers.WorkAction
import org.gradle.workers.WorkParameters

interface TsInterfaceGeneratorWorkParameters : WorkParameters {
    val rootClasses: ListProperty<String>
    val outputLocation: RegularFileProperty
}

abstract class TsInterfaceGeneratorWorkAction : WorkAction<TsInterfaceGeneratorWorkParameters> {
    override fun execute() {
        val config = KxsTsConfig()
        val sourceCodeGenerator = object : TsSourceCodeGenerator.Default(config) {
            override fun generateTypeReference(typeRef: TsTypeRef): String {
                val list = (typeRef as? TsTypeRef.Literal)?.element as? TsLiteral.TsList
                    ?: return super.generateTypeReference(typeRef)
                val element = generateTypeReference(list.valueTypeRef)
                // Upstream appends [] to a nullable union without grouping its element type.
                // https://github.com/adamko-dev/kotlinx-serialization-typescript-generator/blob/df148dcff24078589232202f4a904aa12a734672/modules/kxs-ts-gen-core/src/commonMain/kotlin/dev/adamko/kxstsgen/core/TsSourceCodeGenerator.kt#L189-L222
                val item = if (list.valueTypeRef.nullable) "($element)" else element
                val nullable = if (typeRef.nullable) " | ${generatePrimitive(TsLiteral.Primitive.TsNull)}" else ""
                return "$item[]$nullable"
            }
        }
        val tsGenerator = KxsTsGenerator(config, sourceCodeGenerator)
        val classLoader = Thread.currentThread().contextClassLoader
        val descriptors = parameters.rootClasses.get().map { serializer(classLoader.loadClass(it)) }
        val interfaceText = tsGenerator.generate(*descriptors.toTypedArray()) + "\n"
        parameters.outputLocation.get().asFile.writeText(interfaceText)
    }
}
