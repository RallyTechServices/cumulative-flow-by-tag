Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'master_control_box', layout: {type: 'hbox'}, items: [
                 {xtype:'container',itemId:'control_box',layout: {type:'vbox'}, flex: 1},
                 {xtype:'container',itemId:'summary_box',layout: {type:'vbox'}, 
                     flex: 1, margin: 50, padding: 10, 
                     tpl: '{0} % of Total Points Completed',
                     emptyText: ''},
                 {xtype:'container',itemId:'litter_box',layout: {type:'vbox'}, flex: 1}
         ]},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    selectedPortfolioItemIds: [],
    portfolioItemTypes: ['PortfolioItem/Feature','PortfolioItem/Initiative','PortfolioItem/Theme'],
    portfolioItemStateDone: 'Done',
    launch: function() {
        Ext.create('CumulativeFlowCalculator',{});
        var min_dropdown_width = 300; 
        var label_width = 100;
        this.down('#control_box').add({
            xtype: 'rallytagpicker',
            itemId: 'tag-picker',
            alwaysExpanded: false,
            minWidth: min_dropdown_width,
            fieldLabel: 'Tags',
            labelWidth: label_width,
            labelAlign: 'right',
            padding: 10
        });
        
        
        this.down('#control_box').add({
            xtype: 'container',
            itemId: 'control_hbox',
            layout: {type: 'hbox'},
            padding: 5,
            items: [{
                xtype: 'rallytextfield',
                itemId: 'selected-portfolio-item',
                width: min_dropdown_width,
                emptyText: 'Select Portfolio Item',
                readOnly: true,
                fieldLabel: 'Portfolio Item',
                labelWidth: 100,
                margin: '0 10 0 10',
                labelAlign: 'right'
            },{ xtype: 'rallybutton',
                text: 'Select...',
                scope: this,
                margin: '0 10 0 10',
                handler: this._selectPortfolioItems
                }]
           
        });
        
        this.down('#summary_box').add({
            xtype: 'rallytextfield',
            itemId: 'summary-text',
            width: 350
        });
        this.down('#control_box').add({
            xtype: 'rallybutton',
            text: 'Run',
            margin: '10 10 10 115',
            scope: this,
            handler: this._run
        });
        
    },
    _selectPortfolioItems: function(){
        
        Ext.create('Rally.ui.dialog.SolrArtifactChooserDialog', {
            artifactTypes: ['portfolioitem'],
            autoShow: true,
            height: 250,
            title: 'Choose Portfolio Items',
            listeners: {
                artifactchosen: function(ac, selectedRecord){
                    this.selectedPortfolioItemIds = [selectedRecord.get('ObjectID')];
                    this.down('#selected-portfolio-item').setValue(selectedRecord.get('FormattedID') + ':' + selectedRecord.get('Name'));
                },
                scope: this
            }
         });
    },
    _run: function(){
        this.logger.log('_run');
        var tags = this._getTagObjectIDs();  

        this._getAssociatedPortfolioItems(tags, this.selectedPortfolioItemIds).then({
            scope:this,
            success: function(data){
                this.logger.log('_run Success', data);
                this._createChart(data[0], data[1],data[2],data[3]);
            },
            failure: function(error, success){
                alert(error);
            }
        });
    },
    _createChart: function(portfolioItemIds, totalPoints, startDate, endDate){
        this.logger.log('_createChart',portfolioItemIds, totalPoints, startDate, endDate);
        this.down('#display_box').add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            calculatorType: 'CumulativeFlowCalculator',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(portfolioItemIds),
            calculatorConfig: {
                stateFieldName: 'ScheduleState',
                stateFieldValues: ['Defined','In-Progress','Completed','Accepted'],
                totalPoints: totalPoints,
                startDate: startDate,
                endDate: endDate
            },
            chartConfig: this._getChartConfig(),
            listeners: {
                scope: this,
                chartRendered: this._updateSummary
            }
        });    
    },
    _updateSummary: function(chart){
        console.log('summary',chart.calculator,chart.calculator.getPercentCompleted());
        this.down('#summary-text').setValue(chart.calculator.getPercentCompleted());
    },
    _getChartConfig: function(){
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Cumulative Flow by Tags'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: 7,
            },
            yAxis: [
                {
                    title: {
                        text: 'Points'
                    }
                }
            ],
            plotOptions: {
                series: {
                    marker: { enabled: false },
                    stacking: 'normal'
                },
                line: {
                    connectNulls: true,
                    stacking: 'null'
                }
            }
        };
        
    },
    _translatePreliminaryEstimate: function(pe_object_id){
        return 10;
    },
    _getAssociatedPortfolioItems: function(tags, pids){
        this.logger.log('_getAssociatedPortfolioItems', tags, pids);
        var deferred = Ext.create('Deft.Deferred');
        var portfolio_item_ids = [];
        var top_level_pis = [];
        var find_obj = {
                _TypeHierarchy: {$in: this.portfolioItemTypes},
                __At: "current" 
            };
        if (tags.length > 0) {
            find_obj.Tags = {$in: tags};
        }
        if (pids.length > 0) {
            find_obj.ObjectID = {$in: pids};
        }
        
        Ext.create('Rally.data.lookback.SnapshotStore', {
            listeners: {
                scope: this,
                load: function(store, data, success) {
                    if (success) {
                        //Now parse through the data to get the portfolio item object ids that we want
                        var total = 0;
                        var startDate = new Date('1/1/2999');
                        var endDate = new Date('1/1/1970'); 
                        Ext.each(data, function(d){
                            portfolio_item_ids.push(d.get('ObjectID'));
                            if (d.get('State') == this.portfolioItemStateDone){
                                total += Number(d.get('LeafStoryPlanEstimateTotal'));
                            } else {
                                var pe = this._translatePreliminaryEstimate(d.get('PreliminaryEstimate'));
                                var se = Number(d.get('LeafStoryPlanEstimateTotal'));
                                total += Math.max(se,pe);
                            }
                            var sd = new Date(d.get('PlannedStartDate'));
                            var ed = new Date(d.get('PlannedEndDate'));
                            
                            console.log(d.get('FormattedID'),sd, ed);
                            if (sd != 'Invalid Date' && sd < startDate){
                                    startDate = sd;
                            }
                            if (ed != 'Invalid Date' && ed > endDate){
                                    endDate = ed;
                            }
                        },this);
                        deferred.resolve([portfolio_item_ids, total, startDate, endDate]);
                    } else {
                        deferred.reject('Error getting associated Portfolio Items', success);
                    }
                }
            },
            autoLoad: true,
            fetch: ['ObjectID', 'FormattedID','Name','_ItemHierarchy','_TypeHierarchy','LeafStoryPlanEstimateTotal','PreliminaryEstimate','PlannedStartDate','PlannedEndDate','State'],
            hydrate: ['State','PreliminaryEstimate'],
            find: find_obj
        });
        return deferred; 
    },

    _getTagObjectIDs: function(){
        var tag_objects = this.down('#tag-picker').getValue(); 
        var tags = [];
        Ext.each(tag_objects, function(to){
            tags.push(to.get('ObjectID'));
        },this);
        return tags; 
    },
    _getStoreConfig: function(portfolioItemObjectIds){
        this.logger.log('_getStoreConfig', portfolioItemObjectIds);
        return {
            find: {
                _TypeHierarchy: 'HierarchicalRequirement',
                Children: null,
                _ProjectHierarchy: this.getContext().getProject().ObjectID,
                _ItemHierarchy: {$in: portfolioItemObjectIds}
             },
            fetch: ['ScheduleState','PlanEstimate','_TypeHierarchy','_ValidTo','_ValidFrom'],
            hydrate: ['ScheduleState','_TypeHierarchy'],
            compress: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    }
});