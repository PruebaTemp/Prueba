import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabase';
import { 
  FileText, 
  Search, 
  Calendar, 
  User, 
  ChevronRight, 
  ArrowLeft,
  Stethoscope,
  TestTube,
  Pill,
  Activity,
  AlertCircle,
  Users
} from 'lucide-react';

// Tipos de datos
interface Persona {
  id_persona: number;
  prenombres: string;
  primer_apellido: string;
  segundo_apellido: string;
  dni_idcarnet: string;
  sexo: string;
  fecha_nacimiento: string;
  direccion_legal: string;
  correo_electronico?: string;
  numero_celular_personal?: string;
}

interface HistoriaClinica {
  id_historia: number;
  fecha_creacion: string;
  estado: string;
  perfil_medico: {
    id_perfil_medico: number;
    fecha_atencion: string;
    grupo_sanguineo?: string;
    ambiente_residencia?: string;
    orientacion_sexual?: string;
    vida_sexual_activa?: boolean;
  };
  persona?: Persona;
}

interface ServicioMedico {
  id_servicio_medico: number;
  fecha_servicio: string;
  hora_inicio_servicio: string;
  hora_fin_servicio: string;
  cita_medica: {
    id_cita_medica: number;
    estado: string;
    fecha_hora_programada: string;
    personal_medico: {
      persona: {
        prenombres: string;
        primer_apellido: string;
        segundo_apellido: string;
      };
      especialidad: {
        descripcion: string;
      };
    };
  };
  consulta_medica?: {
    motivo_consulta?: string;
    observaciones_generales?: string;
    tipo_servicio: {
      nombre: string;
    };
    subtipo_servicio: {
      nombre: string;
    };
  }[];
  diagnosticos?: {
    detalle?: string;
    morbilidad: {
      descripcion?: string;
      tipo: string;
      nivel_gravedad?: string;
      cie10: {
        codigo?: string;
        descripcion?: string;
      };
    };
  }[];
  tratamientos?: {
    razon?: string;
    observaciones?: string;
    duracion_cantidad?: number;
    unidad_tiempo: {
      nombre?: string;
    };
    tratamiento_medicamentos?: {
      motivo?: string;
      cantidad_dosis: number;
      frecuencia: string;
      medicamento: {
        nombre_comercial: string;
        concentracion?: string;
        laboratorio: string;
      };
    }[];
  }[];
  examenes?: {
    descripcion_procedimiento?: string;
    descripcion?: string;
    tipo_procedimiento?: string;
    tipo_laboratorio?: string;
    resultado?: string;
    fecha_hora_atencion: string;
  }[];
}

const MedicalRecords: React.FC = () => {
  const { user } = useUser();
  const [historias, setHistorias] = useState<HistoriaClinica[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHistoria, setSelectedHistoria] = useState<HistoriaClinica | null>(null);
  const [serviciosMedicos, setServiciosMedicos] = useState<ServicioMedico[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);

  useEffect(() => {
    if (user) {
      fetchHistoriasClinicas();
    }
  }, [user]);

  const fetchHistoriasClinicas = async () => {
    if (!user) return;

    try {
      setLoading(true);
      let historias: HistoriaClinica[] = [];

      if (user.currentRole === 'admin') {
        // Los administradores pueden ver todas las historias clínicas
        const { data, error } = await supabase
          .from('historia_clinica')
          .select(`
            id_historia,
            fecha_creacion,
            estado_historia_clinica!inner(nombre_estado),
            perfil_medico!inner(
              id_perfil_medico,
              fecha_atencion,
              grupo_sanguineo,
              ambiente_residencia,
              orientacion_sexual,
              vida_sexual_activa
            )
          `);

        if (error) throw error;

        // Para cada historia, obtener la persona asociada
        for (const historia of data || []) {
          const personaAsociada = await obtenerPersonaDeHistoria(historia.id_historia);
          historias.push({
            ...historia,
            estado: historia.estado_historia_clinica.nombre_estado,
            persona: personaAsociada
          });
        }

      } else if (user.currentRole === 'medical') {
        // El personal médico puede ver historias de sus pacientes
        // Primero obtenemos el ID del personal médico
        const { data: personalMedico, error: errorPersonal } = await supabase
          .from('personal_medico')
          .select('id_personal_medico')
          .eq('id_persona', parseInt(user.currentProfileId))
          .single();

        if (errorPersonal || !personalMedico) {
          console.error('Error obteniendo personal médico:', errorPersonal);
          setHistorias([]);
          return;
        }

        // Obtener pacientes que han tenido citas con este médico
        const { data: citasMedicas, error: errorCitas } = await supabase
          .from('cita_medica')
          .select(`
            paciente!inner(
              id_paciente,
              id_historia
            )
          `)
          .eq('id_personal_medico', personalMedico.id_personal_medico);

        if (errorCitas) throw errorCitas;

        // Obtener IDs únicos de historias clínicas
        const historiasIds = [...new Set(citasMedicas?.map(cita => cita.paciente.id_historia) || [])];

        if (historiasIds.length > 0) {
          const { data, error } = await supabase
            .from('historia_clinica')
            .select(`
              id_historia,
              fecha_creacion,
              estado_historia_clinica!inner(nombre_estado),
              perfil_medico!inner(
                id_perfil_medico,
                fecha_atencion,
                grupo_sanguineo,
                ambiente_residencia,
                orientacion_sexual,
                vida_sexual_activa
              )
            `)
            .in('id_historia', historiasIds);

          if (error) throw error;

          // Para cada historia, obtener la persona asociada
          for (const historia of data || []) {
            const personaAsociada = await obtenerPersonaDeHistoria(historia.id_historia);
            historias.push({
              ...historia,
              estado: historia.estado_historia_clinica.nombre_estado,
              persona: personaAsociada
            });
          }
        }

      } else if (user.currentRole === 'patient') {
        // Los pacientes pueden ver su historial y el de personas asociadas
        const personasIds = user.profiles.map(profile => parseInt(profile.id));

        // Obtener historias clínicas de todas las personas asociadas
        const { data: pacientes, error: errorPacientes } = await supabase
          .from('paciente')
          .select(`
            id_historia,
            historia_clinica!inner(
              id_historia,
              fecha_creacion,
              estado_historia_clinica!inner(nombre_estado),
              perfil_medico!inner(
                id_perfil_medico,
                fecha_atencion,
                grupo_sanguineo,
                ambiente_residencia,
                orientacion_sexual,
                vida_sexual_activa
              )
            )
          `)
          .in('id_persona', personasIds);

        if (errorPacientes) throw errorPacientes;

        // Para cada historia, obtener la persona asociada
        for (const paciente of pacientes || []) {
          const personaAsociada = await obtenerPersonaDeHistoria(paciente.historia_clinica.id_historia);
          historias.push({
            ...paciente.historia_clinica,
            estado: paciente.historia_clinica.estado_historia_clinica.nombre_estado,
            persona: personaAsociada
          });
        }
      }

      setHistorias(historias);
    } catch (error) {
      console.error('Error fetching historias clínicas:', error);
    } finally {
      setLoading(false);
    }
  };

  const obtenerPersonaDeHistoria = async (idHistoria: number): Promise<Persona | undefined> => {
    try {
      // Buscar el paciente asociado a esta historia clínica
      const { data: paciente, error } = await supabase
        .from('paciente')
        .select(`
          persona!inner(
            id_persona,
            prenombres,
            primer_apellido,
            segundo_apellido,
            dni_idcarnet,
            sexo,
            fecha_nacimiento,
            direccion_legal,
            correo_electronico,
            numero_celular_personal
          )
        `)
        .eq('id_historia', idHistoria)
        .single();

      if (error || !paciente) {
        console.error('Error obteniendo persona de historia:', error);
        return undefined;
      }

      return paciente.persona;
    } catch (error) {
      console.error('Error en obtenerPersonaDeHistoria:', error);
      return undefined;
    }
  };

  const fetchServiciosMedicos = async (idHistoria: number) => {
    try {
      setLoadingServicios(true);

      // Primero obtenemos el paciente asociado a esta historia
      const { data: paciente, error: errorPaciente } = await supabase
        .from('paciente')
        .select('id_paciente')
        .eq('id_historia', idHistoria)
        .single();

      if (errorPaciente || !paciente) {
        console.error('Error obteniendo paciente:', errorPaciente);
        setServiciosMedicos([]);
        return;
      }

      // Obtener servicios médicos del paciente
      const { data: servicios, error } = await supabase
        .from('servicio_medico')
        .select(`
          id_servicio_medico,
          fecha_servicio,
          hora_inicio_servicio,
          hora_fin_servicio,
          cita_medica!inner(
            id_cita_medica,
            estado,
            fecha_hora_programada,
            personal_medico!inner(
              persona!inner(
                prenombres,
                primer_apellido,
                segundo_apellido
              ),
              especialidad!inner(
                descripcion
              )
            )
          ),
          consulta_medica(
            motivo_consulta,
            observaciones_generales,
            tipo_servicio!inner(
              nombre
            ),
            subtipo_servicio!inner(
              nombre
            )
          ),
          diagnostico(
            detalle,
            morbilidad!inner(
              descripcion,
              tipo,
              nivel_gravedad,
              cie10!inner(
                codigo,
                descripcion
              )
            )
          ),
          tratamiento(
            razon,
            observaciones,
            duracion_cantidad,
            unidad_tiempo!inner(
              nombre
            ),
            tratamiento_medicamento(
              motivo,
              cantidad_dosis,
              frecuencia,
              medicamento!inner(
                nombre_comercial,
                concentracion,
                laboratorio
              )
            )
          ),
          examen(
            descripcion_procedimiento,
            descripcion,
            tipo_procedimiento,
            tipo_laboratorio,
            resultado,
            fecha_hora_atencion
          )
        `)
        .eq('cita_medica.id_paciente', paciente.id_paciente)
        .order('fecha_servicio', { ascending: false });

      if (error) throw error;

      const serviciosFormateados = servicios?.map(servicio => ({
        ...servicio,
        consulta_medica: servicio.consulta_medica || [],
        diagnosticos: servicio.diagnostico || [],
        tratamientos: servicio.tratamiento?.map(tratamiento => ({
          ...tratamiento,
          tratamiento_medicamentos: tratamiento.tratamiento_medicamento || []
        })) || [],
        examenes: servicio.examen || []
      })) || [];

      setServiciosMedicos(serviciosFormateados);
    } catch (error) {
      console.error('Error fetching servicios médicos:', error);
      setServiciosMedicos([]);
    } finally {
      setLoadingServicios(false);
    }
  };

  const handleSelectHistoria = (historia: HistoriaClinica) => {
    setSelectedHistoria(historia);
    fetchServiciosMedicos(historia.id_historia);
  };

  const filteredHistorias = historias.filter(historia => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const nombreCompleto = historia.persona 
      ? `${historia.persona.prenombres} ${historia.persona.primer_apellido} ${historia.persona.segundo_apellido}`.toLowerCase()
      : '';
    const dni = historia.persona?.dni_idcarnet || '';
    
    return nombreCompleto.includes(searchLower) || 
           dni.includes(searchTerm) ||
           historia.id_historia.toString().includes(searchTerm);
  });

  if (!user) return null;

  if (selectedHistoria) {
    return (
      <HistoriaDetalle 
        historia={selectedHistoria}
        servicios={serviciosMedicos}
        loading={loadingServicios}
        onBack={() => setSelectedHistoria(null)}
      />
    );
  }

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Historias Clínicas</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {filteredHistorias.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paciente
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      DNI
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha Creación
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Grupo Sanguíneo
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHistorias.map((historia) => (
                    <tr key={historia.id_historia} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {historia.persona 
                                ? `${historia.persona.prenombres} ${historia.persona.primer_apellido} ${historia.persona.segundo_apellido}`
                                : 'Nombre no disponible'
                              }
                            </div>
                            <div className="text-sm text-gray-500">
                              ID Historia: {historia.id_historia}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {historia.persona?.dni_idcarnet || 'No disponible'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(historia.fecha_creacion).toLocaleDateString('es-ES')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          historia.estado === 'Activa' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {historia.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {historia.perfil_medico.grupo_sanguineo || 'No especificado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleSelectHistoria(historia)}
                          className="text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          Ver detalles
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron historias clínicas
              </h3>
              <p className="text-gray-500">
                {searchTerm 
                  ? 'No hay historias que coincidan con tu búsqueda.'
                  : 'No tienes acceso a ninguna historia clínica en este momento.'
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Componente para mostrar el detalle de una historia clínica
interface HistoriaDetalleProps {
  historia: HistoriaClinica;
  servicios: ServicioMedico[];
  loading: boolean;
  onBack: () => void;
}

const HistoriaDetalle: React.FC<HistoriaDetalleProps> = ({ historia, servicios, loading, onBack }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'servicios'>('info');

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <button 
          onClick={onBack}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Volver a la lista
        </button>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">
              Historia Clínica #{historia.id_historia}
            </h1>
            <p className="text-gray-600 mt-1">
              {historia.persona 
                ? `${historia.persona.prenombres} ${historia.persona.primer_apellido} ${historia.persona.segundo_apellido}`
                : 'Paciente no identificado'
              }
            </p>
          </div>
          <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
            historia.estado === 'Activa' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-gray-100 text-gray-800'
          }`}>
            {historia.estado}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('info')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'info'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <User className="h-5 w-5 inline mr-2" />
            Información Personal
          </button>
          <button
            onClick={() => setActiveTab('servicios')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'servicios'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Stethoscope className="h-5 w-5 inline mr-2" />
            Servicios Médicos
          </button>
        </nav>
      </div>

      {activeTab === 'info' && (
        <InformacionPersonal historia={historia} />
      )}

      {activeTab === 'servicios' && (
        <ServiciosMedicos servicios={servicios} loading={loading} />
      )}
    </div>
  );
};

// Componente para mostrar información personal
const InformacionPersonal: React.FC<{ historia: HistoriaClinica }> = ({ historia }) => {
  const { persona, perfil_medico } = historia;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Datos Personales */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Datos Personales</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500">Nombre Completo</label>
            <p className="mt-1 text-sm text-gray-900">
              {persona 
                ? `${persona.prenombres} ${persona.primer_apellido} ${persona.segundo_apellido}`
                : 'No disponible'
              }
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">DNI</label>
            <p className="mt-1 text-sm text-gray-900">{persona?.dni_idcarnet || 'No disponible'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Sexo</label>
            <p className="mt-1 text-sm text-gray-900">
              {persona?.sexo === 'M' ? 'Masculino' : persona?.sexo === 'F' ? 'Femenino' : 'No especificado'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Fecha de Nacimiento</label>
            <p className="mt-1 text-sm text-gray-900">
              {persona?.fecha_nacimiento 
                ? new Date(persona.fecha_nacimiento).toLocaleDateString('es-ES')
                : 'No disponible'
              }
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Dirección</label>
            <p className="mt-1 text-sm text-gray-900">{persona?.direccion_legal || 'No disponible'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Teléfono</label>
            <p className="mt-1 text-sm text-gray-900">{persona?.numero_celular_personal || 'No disponible'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Email</label>
            <p className="mt-1 text-sm text-gray-900">{persona?.correo_electronico || 'No disponible'}</p>
          </div>
        </div>
      </div>

      {/* Perfil Médico */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Perfil Médico</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500">Grupo Sanguíneo</label>
            <p className="mt-1 text-sm text-gray-900">{perfil_medico.grupo_sanguineo || 'No especificado'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Ambiente de Residencia</label>
            <p className="mt-1 text-sm text-gray-900">{perfil_medico.ambiente_residencia || 'No especificado'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Orientación Sexual</label>
            <p className="mt-1 text-sm text-gray-900">{perfil_medico.orientacion_sexual || 'No especificado'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Vida Sexual Activa</label>
            <p className="mt-1 text-sm text-gray-900">
              {perfil_medico.vida_sexual_activa === true 
                ? 'Sí' 
                : perfil_medico.vida_sexual_activa === false 
                ? 'No' 
                : 'No especificado'
              }
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Fecha de Última Atención</label>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(perfil_medico.fecha_atencion).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Historia Creada</label>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(historia.fecha_creacion).toLocaleDateString('es-ES')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente para mostrar servicios médicos
const ServiciosMedicos: React.FC<{ servicios: ServicioMedico[]; loading: boolean }> = ({ servicios, loading }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (servicios.length === 0) {
    return (
      <div className="text-center py-12">
        <Stethoscope className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay servicios médicos registrados
        </h3>
        <p className="text-gray-500">
          Este paciente no tiene servicios médicos en su historial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {servicios.map((servicio) => (
        <div key={servicio.id_servicio_medico} className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header del servicio */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-lg font-medium text-gray-800">
                  Servicio Médico #{servicio.id_servicio_medico}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(servicio.fecha_servicio).toLocaleDateString('es-ES')} - 
                  {servicio.hora_inicio_servicio} a {servicio.hora_fin_servicio}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">
                  Dr. {servicio.cita_medica.personal_medico.persona.prenombres} {servicio.cita_medica.personal_medico.persona.primer_apellido}
                </p>
                <p className="text-xs text-gray-500">
                  {servicio.cita_medica.personal_medico.especialidad.descripcion}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Consulta Médica */}
            {servicio.consulta_medica && servicio.consulta_medica.length > 0 && (
              <div className="mb-6">
                <h5 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <Stethoscope className="h-5 w-5 mr-2 text-blue-600" />
                  Consulta Médica
                </h5>
                {servicio.consulta_medica.map((consulta, index) => (
                  <div key={index} className="bg-blue-50 p-4 rounded-md mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Tipo de Servicio</label>
                        <p className="text-sm text-gray-900">{consulta.tipo_servicio.nombre}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Subtipo</label>
                        <p className="text-sm text-gray-900">{consulta.subtipo_servicio.nombre}</p>
                      </div>
                      {consulta.motivo_consulta && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Motivo de Consulta</label>
                          <p className="text-sm text-gray-900">{consulta.motivo_consulta}</p>
                        </div>
                      )}
                      {consulta.observaciones_generales && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                          <p className="text-sm text-gray-900">{consulta.observaciones_generales}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Diagnósticos */}
            {servicio.diagnosticos && servicio.diagnosticos.length > 0 && (
              <div className="mb-6">
                <h5 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
                  Diagnósticos
                </h5>
                {servicio.diagnosticos.map((diagnostico, index) => (
                  <div key={index} className="bg-red-50 p-4 rounded-md mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Código CIE-10</label>
                        <p className="text-sm text-gray-900">{diagnostico.morbilidad.cie10.codigo || 'No especificado'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Tipo</label>
                        <p className="text-sm text-gray-900">{diagnostico.morbilidad.tipo}</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Descripción</label>
                        <p className="text-sm text-gray-900">
                          {diagnostico.morbilidad.descripcion || diagnostico.morbilidad.cie10.descripcion || 'No disponible'}
                        </p>
                      </div>
                      {diagnostico.detalle && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Detalle</label>
                          <p className="text-sm text-gray-900">{diagnostico.detalle}</p>
                        </div>
                      )}
                      {diagnostico.morbilidad.nivel_gravedad && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Nivel de Gravedad</label>
                          <p className="text-sm text-gray-900">{diagnostico.morbilidad.nivel_gravedad}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tratamientos */}
            {servicio.tratamientos && servicio.tratamientos.length > 0 && (
              <div className="mb-6">
                <h5 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <Pill className="h-5 w-5 mr-2 text-green-600" />
                  Tratamientos
                </h5>
                {servicio.tratamientos.map((tratamiento, index) => (
                  <div key={index} className="bg-green-50 p-4 rounded-md mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {tratamiento.razon && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Razón del Tratamiento</label>
                          <p className="text-sm text-gray-900">{tratamiento.razon}</p>
                        </div>
                      )}
                      {tratamiento.duracion_cantidad && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Duración</label>
                          <p className="text-sm text-gray-900">
                            {tratamiento.duracion_cantidad} {tratamiento.unidad_tiempo.nombre}
                          </p>
                        </div>
                      )}
                      {tratamiento.observaciones && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                          <p className="text-sm text-gray-900">{tratamiento.observaciones}</p>
                        </div>
                      )}
                    </div>

                    {/* Medicamentos */}
                    {tratamiento.tratamiento_medicamentos && tratamiento.tratamiento_medicamentos.length > 0 && (
                      <div>
                        <h6 className="text-sm font-medium text-gray-700 mb-2">Medicamentos Prescritos</h6>
                        <div className="space-y-2">
                          {tratamiento.tratamiento_medicamentos.map((medicamento, medIndex) => (
                            <div key={medIndex} className="bg-white p-3 rounded border">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600">Medicamento</label>
                                  <p className="text-sm text-gray-900">{medicamento.medicamento.nombre_comercial}</p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600">Dosis</label>
                                  <p className="text-sm text-gray-900">{medicamento.cantidad_dosis}</p>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600">Frecuencia</label>
                                  <p className="text-sm text-gray-900">{medicamento.frecuencia}</p>
                                </div>
                                {medicamento.medicamento.concentracion && (
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600">Concentración</label>
                                    <p className="text-sm text-gray-900">{medicamento.medicamento.concentracion}</p>
                                  </div>
                                )}
                                <div>
                                  <label className="block text-xs font-medium text-gray-600">Laboratorio</label>
                                  <p className="text-sm text-gray-900">{medicamento.medicamento.laboratorio}</p>
                                </div>
                                {medicamento.motivo && (
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600">Motivo</label>
                                    <p className="text-sm text-gray-900">{medicamento.motivo}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Exámenes */}
            {servicio.examenes && servicio.examenes.length > 0 && (
              <div className="mb-6">
                <h5 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <TestTube className="h-5 w-5 mr-2 text-purple-600" />
                  Exámenes
                </h5>
                {servicio.examenes.map((examen, index) => (
                  <div key={index} className="bg-purple-50 p-4 rounded-md mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Fecha y Hora</label>
                        <p className="text-sm text-gray-900">
                          {new Date(examen.fecha_hora_atencion).toLocaleString('es-ES')}
                        </p>
                      </div>
                      {examen.tipo_procedimiento && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Tipo de Procedimiento</label>
                          <p className="text-sm text-gray-900">{examen.tipo_procedimiento}</p>
                        </div>
                      )}
                      {examen.tipo_laboratorio && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Tipo de Laboratorio</label>
                          <p className="text-sm text-gray-900">{examen.tipo_laboratorio}</p>
                        </div>
                      )}
                      {examen.descripcion_procedimiento && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Descripción del Procedimiento</label>
                          <p className="text-sm text-gray-900">{examen.descripcion_procedimiento}</p>
                        </div>
                      )}
                      {examen.descripcion && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Descripción</label>
                          <p className="text-sm text-gray-900">{examen.descripcion}</p>
                        </div>
                      )}
                      {examen.resultado && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Resultado</label>
                          <p className="text-sm text-gray-900 font-medium">{examen.resultado}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MedicalRecords;