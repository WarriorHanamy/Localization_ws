cmake_minimum_required(VERSION 3.0)
project(bringup)
find_package(catkin REQUIRED)
catkin_package()
install(DIRECTORY launch/ DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}/launch
  FILES_MATCHING PATTERN "*.launch")
install(DIRECTORY config/ DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}/config)
install(DIRECTORY resource/ DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}/resource)
install(PROGRAMS scripts/container-smoke.sh
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION})
