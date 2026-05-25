# jepow-cycles — GPL-2.0-or-later
# Build only from this directory. Do not add this CMake project as a subdirectory
# of jepow-engine.

cmake_minimum_required(VERSION 3.20)
project(jepow_cycles LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(JEPOW_CYCLES_WITH_LIBCYCLES "Link Blender Cycles (requires third_party/blender)" OFF)

add_executable(jepow-cycles
  src/jepow_cycles_bridge.cpp
)

target_include_directories(jepow-cycles PRIVATE include)

if(JEPOW_CYCLES_WITH_LIBCYCLES)
  message(STATUS "libcycles: configure paths to third_party/blender/intern/cycles")
  # add_subdirectory(${CMAKE_SOURCE_DIR}/third_party/blender/intern/cycles ...)
  target_compile_definitions(jepow-cycles PRIVATE JEPOW_CYCLES_WITH_LIBCYCLES=1)
else()
  target_compile_definitions(jepow-cycles PRIVATE JEPOW_CYCLES_WITH_LIBCYCLES=0)
endif()

install(TARGETS jepow-cycles RUNTIME DESTINATION bin)
install(FILES COPYING NOTICE DESTINATION share/jepow-cycles)
