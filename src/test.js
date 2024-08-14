let proximaOptions = arguments[2];
proximaOptions = proximaOptions || {};
const app = THING.App.current;
let campus = arguments[3];
campus = campus || app.query('.Campus')[0];
campus = campus.type === 'Campus' ? campus : (campus.type === 'Building' ? campus.parent : campus.parent.parent);
const targetLevel = app.level.current;

class GroundObject extends THING.BaseObject {

	// 构造函数
	constructor(app) {
		super(app);

		this._mesh = null;
		this._url = '';

		this._maskUrl = '';
		this._opacity = 0;
		this._repeatFactor = 1;
		this._glowFactor = 1;
		this._color = null;

		this._sizeFactor = 2;
		this._speed = 1;
		this._flowColor = null;
		this._groundReflect = false;
		this._groundClearance = 0.1;
		this._animationType = 'flow';// 默认flow为扫光，rotation为旋转
		this._reflectFactor = 1;
		this._repeatFactorInner = 1;
		this._repeatFactorOuter = 1;
		this.targetCampus = null;

		// 如果需要每帧更新，开启tickable
		this.tickable = true;
		this.pickable = false;
	}

	// Setup, 一些mesh的构造建议在这里执行
	customSetup(param) {
		this._url = param['url'];
		this._maskUrl = param['maskUrl'] || this._maskUrl;
		this._opacity = param['opacity'] === undefined ? this._opacity : param['opacity'];
		this._color = param['color'] || this._color;
		this._glowFactor = param['glowFactor'] === undefined ? this._glowFactor : param['glowFactor'];
		this._repeatFactor = param['repeatFactor'] === undefined ? this._repeatFactor : param['repeatFactor'];
		this._sizeFactor = param['sizeFactor'] === undefined ? this._sizeFactor : param['sizeFactor'];
		this._speed = param['animationSpeed'] === undefined ? this._speed : param['animationSpeed'];
		this._flowColor = param['flowColor'] || this._flowColor;
		this._groundReflect = param['groundReflect'] || this._groundReflect;
		this._groundClearance = param['groundClearance'] === undefined ? this._groundClearance : param['groundClearance'];
		this._animationType = param['animationType'] || this._animationType;
		this._reflectFactor = param['reflectFactor'] === undefined ? this._reflectFactor : param['reflectFactor'];
		this._reflectFactor = Math.min(this._reflectFactor, 1);
		this._repeatFactorInner = param['repeatFactorInner'] === undefined ? this._repeatFactor : param['repeatFactorInner'];
		this._repeatFactorOuter = param['repeatFactorOuter'] === undefined ? this._repeatFactor : param['repeatFactorOuter'];

		var material = this._createMaterial(this._url, this._maskUrl, this._opacity, this._repeatFactor, this._color, this._glowFactor, this._speed, this._flowColor, this._groundReflect, this._animationType);
		var geometry = new THREE.PlaneGeometry(1, 1);
		var mesh = new THREE.Mesh(geometry, material);
		this._mesh = mesh;
		this._mesh.rotation.x = -Math.PI / 2;
		this.node.add(this._mesh);
		this.pickable = false;

		this.groundColorValue = this._color;
		this.flowColorValue = this._flowColor;
		this.targetCampus = param['target'] === undefined ? this.app.query('.Campus')[0] : param['target'];

		this.updateGround();
	}


	// Update
	update(deltaTime) {
		super.update(deltaTime);
		if (this._mesh.material.type == 'ShaderMaterial') {
			this._mesh.material.uniforms['time'].value += deltaTime;
		}
		return true;
	}

	// Destroy
	destroy() {
		super.destroy();
		// 释放
	}

	setMaterialRoughness(child, roughness) {
		if (child.children.length > 0) {
			this.getChilds(child.children, roughness);
		}

		if (child.material) {
			child.material.roughness = roughness;
		}
	}

	getChilds(childs, roughness) {
		for (var i = 0; i < childs.length; i++) {
			this.setMaterialRoughness(childs[i], roughness);
		}
	}

	// 切换层级后调用。用于更新地板位置和地板范围
	updateGround() {
		let target = this.app.level.current;
		if (!target) {
			target = this.targetCampus;
		}
		if (target.type === 'GeoBasePoint') {
			target = this.app.query('.Campus')[0];
		}
		if (target instanceof THING.Floor || target instanceof THING.Building || target instanceof THING.Campus) {
			const bbx = target.getOrientedBox(true, false);
			const radius = bbx.size[1] / 2 + 0.2 - this.groundClearance;
			const rDis = THING.Math.scaleVector(target.up, radius);
			this.position = THING.Math.subVector(bbx.center, rDis);
			this.scale = THING.Math.scaleVector([bbx.radius, 1, bbx.radius], this._sizeFactor);
			this.worldAngles = target.worldAngles;

			if (this.groundReflect) {

				this.app.postEffect = {
					postEffect: {
						enable: true,
						screenSpaceReflection: {
							maxRayDistance: 200,
							pixelStride: bbx.size[1] * this._reflectFactor / 2,
							pixelStrideZCutoff: 900,
							screenEdgeFadeStart: 0.9,
							eyeFadeStart: 0.4,
							eyeFadeEnd: 0.8
						}
					}
				};
			}

			if (target instanceof THING.Campus) {
				if (this.repeatFactorOuter) {
					this.repeatFactorValue = this.repeatFactorOuter;
				}
			} else {
				if (this.repeatFactorInner) {
					this.repeatFactorValue = this.repeatFactorInner;
				}
			}

		} else if (!target) {
			this.position = [0, this._groundClearance, 0];
			this.scale = [this._sizeFactor, 1, this._sizeFactor];
		}

	}

	// 创建材质
	_createMaterial(url, maskUrl, opacity, repeatFactor, color, glowFactor, speed, flowColor, groundReflect, animationType) {
		var vertShaderReflect = `
                        void main() {
                         gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
                        }
                    `;

		var vertShaderDefault = `
                    varying vec2 vUv;
                    varying vec2 mapUv;
                    
                    uniform float repeatFactor;
    
                    void main() {
                     gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
    
                     vUv=uv;
                     mapUv=uv*repeatFactor;
                    }
                `;

		var fragShaderReflect = `
                        void main() {  
                            gl_FragColor= vec4(1.,1.,1.,0.);                    
                        }
                    `;

		var fragShaderFlow = `
                    varying vec2 vUv;
                    varying vec2 mapUv;
                    
                    uniform sampler2D map;
                    uniform sampler2D maskMap;
                    uniform float time;
                    uniform float opacity;
                    uniform vec3 color;
                    uniform vec3 flowColor;
                    uniform float glowFactor;
                    uniform float speed;
    
                    void main() {  
                        float t=mod(time/5.*speed,1.);      
                        vec2 uv=abs((vUv-vec2(0.5))*2.0);
                        float dis = length(uv);
                        float r = t-dis;
                        
                        vec4 col=texture2D( map, mapUv );
                        vec3 finalCol;
                        vec4 mask = texture2D(maskMap, vec2(0.5,r));
                        finalCol = mix(color,flowColor,clamp(0.,1.,mask.a*glowFactor));
                        gl_FragColor= vec4(finalCol.rgb,(opacity+mask.a*glowFactor)*col.a*(1.-dis));                                 
                    }
                `;

		var fragShaderRotation = `
                    varying vec2 vUv;
                    varying vec2 mapUv;
                    
                    uniform sampler2D map;
                    uniform sampler2D maskMap;
                    uniform float time;
                    uniform float opacity;
                    uniform vec3 color;
                    uniform vec3 flowColor;
                    uniform float glowFactor;
                    uniform float speed;
    
                    vec2 newUV(vec2 coord,float c,float s)
                    {
                        mat2 m=mat2(c,-s,s,c);
                        return m*coord;
                    }
    
                    void main() {  
                        float t=speed*time;      
                        vec2 pivot=vec2(0.5,0.5);
                        vec2 uv=newUV((vUv-pivot),cos(t),sin(t))+pivot;
                        vec4 finalCol;
    
                        if(uv.x>0.&&uv.x<1.&&uv.y>0.&&uv.y<1.)
                        {
                            finalCol=vec4(color,opacity*texture2D( map, uv ).a);
                        }
    
                        gl_FragColor= clamp(finalCol,0.,1.);                        
                    }
                `;

		var textureLoader = new THREE.TextureLoader();
		var mainTex = textureLoader.load(url);
		mainTex.wrapS = mainTex.wrapT = THREE.RepeatWrapping;
		var maskTex = textureLoader.load(maskUrl);
		maskTex.wrapS = maskTex.wrapT = THREE.RepeatWrapping;

		var uniforms = {
			map: { value: mainTex },
			time: { value: 0. },
			opacity: { value: opacity },
			repeatFactor: { value: repeatFactor },
			maskMap: { value: maskTex },
			color: { value: color },
			glowFactor: { value: glowFactor },
			speed: { value: speed },
			flowColor: { value: flowColor }
		};

		var vertShader = groundReflect ? vertShaderReflect : vertShaderDefault;
		var fragShader = groundReflect ? fragShaderReflect : (animationType === 'flow' ? fragShaderFlow : fragShaderRotation);
		var shaderMaterial = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: vertShader,
			fragmentShader: fragShader,
			transparent: true,
			depthWrite: false
		});

		if (groundReflect) {
			shaderMaterial.roughness = 0.1;
		} else {
			shaderMaterial.roughness = 1;
		}

		return shaderMaterial;
	}

	/**
	 * 开启地板反射
	 * @type {Boolean}
	 */
	set groundReflect(value) {
		this._groundReflect = value;
		this.tickable = !this._groundReflect;
		let target = this.app.level.current;
		if (!target) {
			return;
		}
		if (target.type === 'GeoBasePoint') {
			target = this.app.query('.Campus')[0];
		}
		if (!this.groundReflect) {
			this._mesh.material.roughness = 1;
		} else {
			this._mesh.material.roughness = 0.1;
			this.updateGround();
		}
	}

	get groundReflect() {
		return this._groundReflect;
	}

	/**
	 * 地板范围
	 * @type {Number}
	 */
	set sizeFactor(value) {
		this._sizeFactor = value;
		this.updateGround();
	}

	get sizeFactor() {
		return this._sizeFactor;
	}

	/**
	 * 切换底图
	 * @type {String}
	 */
	set imageUrl(value) {
		this._url = value;
		let map = new THREE.TextureLoader().load(this._url);
		map.wrapS = map.wrapT = THREE.RepeatWrapping;
		this._mesh.material.uniforms.map.value = map;
	}

	get imageUrl() {
		return this._url;
	}

	/**
	 * 切换扫光图
	 * @type {String}
	 */
	set maskUrl(value) {
		this._maskUrl = value;
		let mask = new THREE.TextureLoader().load(this._maskUrl);
		mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
		this._mesh.material.uniforms.maskMap.value = mask;
	}

	get maskUrl() {
		return this._maskUrl;
	}

	/**
	 * 透明度
	 * @type {Number}
	 */
	set opacityValue(value) {
		this._opacity = value;
		this._mesh.material.uniforms.opacity.value = this._opacity;
	}

	get opacityValue() {
		return this._opacity;
	}

	/**
	 * 扫光强度
	 * @type {Number}
	 */
	set glowFactorValue(value) {
		this._glowFactor = value;
		this._mesh.material.uniforms.glowFactor.value = this._glowFactor;
	}

	get glowFactorValue() {
		return this._glowFactor;
	}

	/**
	 * uv重复系数
	 * @type {Number}
	 */
	set repeatFactorValue(value) {
		this._repeatFactor = value;
		this._mesh.material.uniforms.repeatFactor.value = this._repeatFactor;
	}

	get repeatFactorValue() {
		return this._repeatFactor;
	}

	/**
	 * 室外uv重复系数
	 * @type {Number}
	 */
	set repeatFactorOuter(value) {
		this._repeatFactorOuter = value;
	}

	get repeatFactorOuter() {
		return this._repeatFactorOuter;
	}

	/**
	 * 室内uv重复系数
	 * @type {Number}
	 */
	set repeatFactorInner(value) {
		this._repeatFactorInner = value;
	}

	get repeatFactorInner() {
		return this._repeatFactorInner;
	}

	/**
	 * 地板颜色
	 * @type {Color}
	 */
	set groundColorValue(value) {
		this._color = new THREE.Color(value);
		if (this._mesh) {
			this._mesh.material.uniforms.color.value = this._color;
		}
	}

	get groundColorValue() {
		return this._color;
	}

	/**
	 * 扫光颜色
	 * @type {Color}
	 */
	set flowColorValue(value) {
		this._flowColor = new THREE.Color(value);
		if (this._mesh) {
			this._mesh.material.uniforms.flowColor.value = this._flowColor;
		}
	}

	get flowColorValue() {
		return this._flowColor;
	}

	/**
	 * 动画速度
	 * @type {Number}
	 */
	set animationSpeed(value) {
		this._speed = value;
		this._mesh.material.uniforms.speed.value = this._speed;
	}

	get animationSpeed() {
		return this._speed;
	}

	/**
	 * 离地高度
	 * @type {Number}
	 */
	set groundClearance(value) {
		this._groundClearance = value;
		this.updateGround();
	}

	get groundClearance() {
		return this._groundClearance;
	}

	/**
	 * 动画类型
	 * @type {String}
	 */
	set animationType(value) {
		this._animationType = value;
		this._mesh.material = this._createMaterial(this._url, this._maskUrl, this._opacity, this._repeatFactor, this._color, this._glowFactor, this._speed, this._flowColor, this._groundReflect, this._animationType);
	}

	get animationType() {
		return this._animationType;
	}

	/**
	 * 反射影子的高度的系数
	 * @type {Number}
	 */
	set reflectFactor(value) {
		this._reflectFactor = value;
		this.updateGround();
	}

	get reflectFactor() {
		return this._reflectFactor;
	}

	// #endregion


}

if (!THING.factory.hasClass('GroundObject')) {
	THING.factory.registerClass('GroundObject', GroundObject);
}

//生成地板
const setGroundDecorate = function() {
	const _createGround = function() {
		proximaOptions.themeManager._objGround = [];
		if (proximaOptions.ground.groundReflect) {
			let ground = app.create({
				type: 'GroundObject',
				groundClearance: 0.1,
				groundReflect: true,
				parent: campus,
				target: campus,
				style: {
					skipBoundingBox: !0
				},
				reflectFactor: proximaOptions.ground.reflectFactor
			});
			ground.style.skipBoundingBox = true;
			proximaOptions.themeManager._objGround.push(ground);
		}

		if (proximaOptions.ground.enable) {
			proximaOptions.ground.item.forEach(obj => {
				let curParam = obj;
				Object.assign(curParam, {
					parent: campus,
					target: campus,
					style: {
						skipBoundingBox: !0
					}
				});
				const finalParam = { type: 'GroundObject', ...curParam };
				let ground = app.create(finalParam);
				ground.style.skipBoundingBox = true;
				proximaOptions.themeManager._objGround.push(ground);
			});
		}
	};

	const _updateGroundPos = function(force = false, ignoreFlyEnd = false) {
		if (
			force
			|| app.level.current.type === 'Building'
			|| (app.level.current.type === 'Floor' && (!app.level.previous || app.level.previous.type !== 'Room'))
			|| app.level.current.type === 'Campus'
		) {
			//园区层级走这里
			const showGround = function showGround() {
				proximaOptions.themeManager._objGround.forEach(curObj => {
					curObj.updateGround();
				});

				setTimeout(() => {
					proximaOptions.themeManager._objGround.forEach(curObj => {
						curObj.visible = true;
					});
				}, 250);
			};

			proximaOptions.themeManager._objGround.forEach(curObj => {
				curObj.visible = false;
			});

			if (ignoreFlyEnd) {
				setTimeout(() => {
					showGround();
				}, 0);
			} else {
				app.one(THING.EventType.LevelFlyEnd, (ev) => {
					setTimeout(() => {
						showGround();
					}, 0);
				}, 'levelFlyEndToUpdateGround');
			}
		} else if (typeof CMAP !== 'undefined' && THING.Math.getVectorLength(campus.position) > 6300000
			&& app.level.current.type !== 'Thing' && app.level.current.type !== 'Room' && app.level.current.type !== 'Floor') {
			//地球层级走这里
			if (typeof proximaOptions.ground.visibleOnEarth !== 'undefined') {
				//地图级别地面显示/隐藏
				proximaOptions.themeManager._objGround.forEach(curObj => {
					curObj.visible = proximaOptions.ground.visibleOnEarth;
				});
			}
		}

	};

	if (!proximaOptions.themeManager._objGround) {
		_createGround();
	} else {
		_updateGroundPos();
	}

	app.on(THING.EventType.EnterLevel, () => {
		if (!proximaOptions.themeManager._objGround) {
			_createGround();
		} else {
			_updateGroundPos();
		}
	}, 'EnterLevelToSetGround', 0);
};

//销毁地板
const destroyGroundDecorate = function() {
	const grounds = campus.query('.GroundObject');
	if (grounds.length > 0) {
		app.off(THING.EventType.EnterLevel, null, 'EnterLevelToSetGround');
	}
	grounds.forEach((cur) => {
		cur.destroy();
	});
	proximaOptions.themeManager._objGround = null;
};

if (proximaOptions.ground && JSON.stringify(proximaOptions.ground) !== '{}') {
	destroyGroundDecorate();
	setGroundDecorate();

	console.log('%c效果模板定制化代码log————————————', 'color: blue');
	console.log('%c是否开启地板反射：' + proximaOptions.ground.groundReflect, 'color: blue');
	if (proximaOptions.inner && proximaOptions.inner.postEffect.screenSpaceReflection) {
		console.log('%c室内ssr是否打开：' + proximaOptions.inner.postEffect.screenSpaceReflection.enable, 'color: blue');
	} else {
		console.log('%c没有室内ssr', 'color: blue');
	}
	if (proximaOptions.outer && proximaOptions.outer.postEffect.screenSpaceReflection) {
		console.log('%c室外ssr是否打开：' + proximaOptions.outer.postEffect.screenSpaceReflection.enable, 'color: blue');
	} else {
		console.log('%c没有室外ssr', 'color: blue');
	}
	console.log('%c—————————————————————————————————', 'color: blue');
} else {
	destroyGroundDecorate();
	console.log('%c该模板没有地面反射和特效地面', 'color: blue');
}

var readJson = function(url, item, proximaOptions) {
	const loader = new THREE.FileLoader();

	loader.load(
		url.concat('/index.json'),

		function(data) {
			try {
				let message = data;

				const target = campus;
				const bbx = target.getOrientedBox(true, false);
				const radius = bbx.size[1] / 2 + 0.2;
				const rDis = THING.Math.scaleVector(target.up, radius);
				const pos = THING.Math.subVector(bbx.center, rDis);
				var data = JSON.parse(message);
				let urlPre = url;
				let dividend = data.listGroups[0].listEmitters[0].position.vec3Spread;
				data.listGroups[0].texture.url = urlPre.concat(data.listGroups[0].texture.url);
				data.listGroups[0].textureTrail.url = urlPre.concat(data.listGroups[0].textureTrail.url);

				//最大粒子数
				let maxCount = THING.Math.ceil(THING.Math.min(10000, item.content.density * data.listGroups[0].iMaxParticleCount * bbx.size[0] * bbx.size[2] / dividend.x / dividend.z * 4));
				//粒子数
				let count = THING.Math.ceil(data.listGroups[0].listEmitters[0].iParticleCount / data.listGroups[0].iMaxParticleCount * maxCount);

				data.listGroups[0].listEmitters[0].iParticleCount = count;
				data.listGroups[0].iMaxParticleCount = maxCount;
				data.listGroups[0].listEmitters[0].position.vec3Spread = {
					x: bbx.size[0] * 2,
					y: item.content.height,
					z: bbx.size[2] * 2
				};
				let pBox = app.create({
					type: 'BaseObject',
					id: `粒子装饰模型父物体_${item.code}`,
					parent: campus,
					position: pos,
					visible: targetLevel && targetLevel.type === 'Campus'
				});

				pBox.style.skipBoundingBox = true;

				let particle = app.create({
					type: 'ParticleSystem',
					id: `粒子装饰模型_${item.code}`,
					name: `粒子装饰模型_${item.code}`,
					data: data,
					parent: pBox,
					localPosition: [0, item.content.offsetHeight + item.content.height / 2, 0],
					angle: 0,
					visible: targetLevel && targetLevel.type === 'Campus'
				});
				particle.style.skipBoundingBox = true;
				particle.userData.cfg = particle.userData.cfg || {};
				particle.userData.cfg.offsetHeight = item.content.offsetHeight + item.content.height / 2;
				proximaOptions.themeManager._objParticle.push(particle);
			} catch (err) {
				console.error(err);
			}
		},

		function(xhr) {
			//console.log((xhr.loaded / xhr.total * 100) + '% loaded');
		},

		// onError回调
		function(err) {
			//console.error('An error happened');
		}
	);
};

//生成粒子
const setParticle = function() {
	const createParticle = function(item) {
		return new Promise((resolve) => {
			let url = item.url;
			url = url.substring(0, url.length - 1);
			readJson(url, item, proximaOptions);
		});
	};

	const createParticles = function(items) {
		proximaOptions.themeManager._objParticle = [];
		return new Promise((resolve) => {
			const objArray = [];
			let iFn = 0;
			items.forEach((item) => {
				createParticle(item).then((obj) => {
					objArray.push(obj);
					iFn += 1;
					if (iFn === items.length) {
						resolve(objArray);
					}
				});
			});
		});
	};

	const updateParticles = function(force = false, ignoreFlyEnd = false) {
		if (
			force
			|| app.level.current.type === 'Campus'
		) {
			//园区层级走这里
			const showParticles = function showParticles(target) {

				if (force && target._lastOBoundingBoxTF) {
					target._lastOBoundingBoxTF = null;
				}
				const bbx = target._lastOBoundingBoxTF ? target._lastOBoundingBoxTF : target.getOrientedBox(true, false);
				if (!target._lastOBoundingBoxTF) {
					target._lastOBoundingBoxTF = THING.Utils.cloneObject(bbx);
				}

				proximaOptions.themeManager._objParticle.forEach((p) => {
					const radius = p.userData.cfg ? (p.userData.cfg.offsetHeight ? p.userData.cfg.offsetHeight : 0) : 0;
					const rDis = THING.Math.scaleVector(target.up, radius);

					p.worldAngles = target.worldAngles;
					p.position = THING.Math.subVector(bbx.center, rDis);
					p.visible = true;
				});
			};
			if (ignoreFlyEnd) {
				setTimeout(() => {
					showParticles(campus);
				}, 1800);
			} else {
				//目前园区只看到走这
				app.one(THING.EventType.LevelFlyEnd, (ev) => {
					const tar = ev.object;
					setTimeout(() => {
						showParticles(tar);
					}, 250);
				}, 'levelFlyEndToUpdateParticle');
			}
		} else if (app.level.current.type === 'Building' || app.level.current.type === 'Floor' || app.level.current.type === 'Room') {
			//室内层级走这里
			if (proximaOptions.themeManager._objParticle) {
				proximaOptions.themeManager._objParticle.forEach((p) => {
					if (p.visible) {
						p.visible = false;
					}
				});
			}
		} else if (typeof CMAP !== 'undefined' && THING.Math.getVectorLength(campus.position) > 6300000 && app.level.current.type !== 'Thing') {
			//地球层级走这里
			if (typeof proximaOptions.particle.visibleOnEarth !== 'undefined') {
				//地图级别粒子显示/隐藏
				if (proximaOptions.themeManager._objParticle) {
					proximaOptions.themeManager._objParticle.forEach((p) => {
						if (p.visible) {
							p.visible = proximaOptions.particle.visibleOnEarth;
						}
					});
				}
			}
		}

	};

	createParticles(proximaOptions.particle.item).then((oa) => {
		proximaOptions.themeManager._objParticle = oa;
		updateParticles(false, true);
	});
	app.on(THING.EventType.EnterLevel, () => {
		if (!proximaOptions.themeManager._objParticle && proximaOptions.particle.item) {
			createParticles(proximaOptions.particle.item).then((oa) => {
				proximaOptions.themeManager._objParticle = oa;
				updateParticles(false, true);
			});
		} else {
			updateParticles();
		}
	}, 'EnterLevelToSetParticle', 0);
};

//销毁粒子
const destroyParticle = function() {
	const particles = campus.query(/粒子装饰模型父物体/);
	if (particles.length > 0) {
		app.off(THING.EventType.EnterLevel, null, 'EnterLevelToSetParticle');
	}
	particles.forEach((cur) => {
		cur.destroy();
	});
	proximaOptions.themeManager._objParticle = null;
};

if (proximaOptions.particle && JSON.stringify(proximaOptions.particle) !== '{}') {
	destroyParticle();
	setParticle();
} else {
	destroyParticle();
	console.log('%c该模板没有粒子', 'color: blue');
}

